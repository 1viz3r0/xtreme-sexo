//! Native query AST evaluated directly against decoded packets; no TShark syntax.
use super::buddy_engine::Packet;
use std::net::IpAddr;

#[derive(Debug)]
pub struct Query { groups: Vec<Vec<Predicate>>, pub description: String }
#[derive(Debug)]
enum Predicate { Protocol(String), Address(String,IpAddr), Port(u16), Text(String), Size(String,u32), Time(String,f64), Not(Box<Predicate>) }
impl Query {
    pub fn matches(&self, packet: &Packet) -> bool { self.groups.is_empty() || self.groups.iter().any(|group|group.iter().all(|p|p.matches(packet))) }
}
fn compare(a: f64, op: &str, b: f64) -> bool { match op { ">"=>a>b, "<"=>a<b, ">="=>a>=b,"<="=>a<=b,_=>a==b } }
impl Predicate {
    fn matches(&self,p: &Packet) -> bool {
        match self {
            Self::Protocol(name)=>p.layers.iter().any(|layer|layer==name),
            Self::Address(direction,ip)=> {
                let source=p.source.parse::<IpAddr>().ok()==Some(*ip);let destination=p.destination.parse::<IpAddr>().ok()==Some(*ip);
                match direction.as_str() {"from"=>source,"to"=>destination,_=>source||destination}
            }
            Self::Port(port)=>p.source_port==Some(*port)||p.destination_port==Some(*port),
            Self::Text(text)=>p.info.to_lowercase().contains(text),
            Self::Size(op,n)=>compare(p.frame.wire_len as f64,op,*n as f64),
            Self::Time(op,n)=>p.time.map(|v|compare(v,op,*n)).unwrap_or(false),
            Self::Not(inner)=>!inner.matches(p),
        }
    }
}
pub fn compile(query: &str) -> Result<Query,String> {
    if query.len()>2048 {return Err("Search is limited to 2048 characters".into());}
    let tokens=tokenize(query)?;if tokens.len()>32 {return Err("Use at most 32 search terms".into());}
    let mut groups=Vec::new();let mut terms=Vec::new();
    for (token,quoted) in tokens {
        if !quoted && token.eq_ignore_ascii_case("OR") {
            if terms.is_empty() {return Err("Put a search term on each side of OR".into());} groups.push(std::mem::take(&mut terms));continue;
        }
        let (negative,value)=if !quoted {token.strip_prefix('-').map(|s|(true,s)).unwrap_or((false,token.as_str()))} else {(false,token.as_str())};
        let pred=if quoted {text(value)?} else {term(value)?};
        terms.push(if negative {Predicate::Not(Box::new(pred))} else {pred});
    }
    if terms.is_empty() && !groups.is_empty() {return Err("Put a search term after OR".into());}
    if !terms.is_empty() {groups.push(terms);}
    Ok(Query { groups,description:if query.trim().is_empty() {"All native-decoded packets".into()} else {format!("Native search: {}",query.trim())} })
}
fn text(v:&str)->Result<Predicate,String> {if v.is_empty(){Err("Search terms cannot be empty".into())}else{Ok(Predicate::Text(v.to_lowercase()))}}
fn term(value:&str)->Result<Predicate,String> {
    let lower=value.to_lowercase();
    if ["tcp","udp","dns","http","tls","arp","icmp","icmpv6","ip","ipv6","ethernet","vlan","sll","sll2"].contains(&lower.as_str()) {return Ok(Predicate::Protocol(lower));}
    if ["quic","dhcp"].contains(&lower.as_str()) {return Err(format!("{value} decoding is not yet supported by the native engine; search udp or port instead."));}
    if let Ok(ip)=value.parse::<IpAddr>() {return Ok(Predicate::Address("ip".into(),ip));}
    if let Some((key,value))=value.split_once(':') {
        return match key.to_lowercase().as_str() {
            "ip"|"from"|"to"=>Ok(Predicate::Address(key.to_lowercase(),value.parse().map_err(|_|"Enter a valid IPv4 or IPv6 address")?)),
            "port"=>{let n:u16=value.parse().map_err(|_|"Port must be 1–65535")?;if n==0 {return Err("Port must be 1–65535".into());}Ok(Predicate::Port(n))},
            "text"=>text(value),
            "size"=>{let(op,n)=comparison(value);Ok(Predicate::Size(op.into(),n.parse().map_err(|_|"Use size:>1000 or size:64")?))},
            "time"=>{let(op,n)=comparison(value);let n:f64=n.parse().map_err(|_|"Use time:>1.5 or time:<=60")?;if !n.is_finite()||n<0.0{return Err("Time must be finite and non-negative".into());}Ok(Predicate::Time(op.into(),n))},
            _=>Err(format!("Unknown native search field {key}. Use ip, from, to, port, text, size or time.")),
        };
    }
    if ["==","&&","||"].contains(&value) {return Err("Use Buddy Search terms, spaces for AND, and OR. Wireshark expressions are not used by the native engine.".into());}
    text(value)
}
fn comparison(v:&str)->(&str,&str){for op in [">=","<=",">","<","="]{if let Some(n)=v.strip_prefix(op){return(op,n);}}("=",v)}
fn tokenize(input:&str)->Result<Vec<(String,bool)>,String>{
    let mut out=Vec::new();let mut token=String::new();let mut quoted=false;let mut whole=false;let mut active=false;let mut chars=input.chars();
    while let Some(c)=chars.next(){match c {
        '"'=>{if !active{whole=true;}quoted=!quoted;active=true;},
        '\\' if quoted=>{let next=chars.next().ok_or("Incomplete escape")?;if next!='"'&&next!='\\'{return Err("Escape only quotes or backslashes".into());}token.push(next);},
        c if c.is_whitespace()&&!quoted=>{if active{out.push((std::mem::take(&mut token),whole));}active=false;whole=false;},
        c=>{token.push(c);active=true;}
    }}
    if quoted{return Err("Close the quoted phrase".into());}if active{out.push((token,whole));}Ok(out)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn invalid_terms_are_rejected(){for q in ["port:0","port:65536","ip:bad","time:NaN","OR tcp","tcp OR","\"unfinished","quic"]{assert!(compile(q).is_err(),"{q}");}}
    #[test] fn native_matching_does_not_use_external_expressions(){
        let frame=super::super::buddy_engine::Frame {number:1,timestamp:None,link:999,wire_len:42,data:vec![]};
        let mut p=super::super::buddy_engine::analyze(vec![frame]).remove(0);
        p.layers=vec!["ip".into(),"udp".into(),"dns".into()];p.source="192.0.2.1".into();p.source_port=Some(1234);p.destination_port=Some(53);p.info="DNS query example.com".into();p.time=Some(1.5);
        assert!(compile("dns port:53 from:192.0.2.1 time:>1").unwrap().matches(&p));
        assert!(compile("tcp OR \"example.com\"").unwrap().matches(&p));
        assert!(!compile("udp -port:53").unwrap().matches(&p));
        assert!(!compile("size:>100").unwrap().matches(&p));
        assert!(!compile("\"tcp || udp\"").unwrap().matches(&p));
    }
}
