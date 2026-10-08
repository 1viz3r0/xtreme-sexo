//! Native Capture Buddy capture reader and protocol decoder. No external analyzer.
use std::net::{Ipv4Addr, Ipv6Addr};

pub const MAX_BYTES: usize = 64 * 1024 * 1024;
const MAX_PACKETS: usize = 100_000;

#[derive(Clone, Debug)]
pub struct Frame { pub number: u64, pub timestamp: Option<f64>, pub link: u32, pub wire_len: u32, pub data: Vec<u8> }
#[derive(Clone, Debug)]
pub struct Packet {
    pub frame: Frame, pub time: Option<f64>, pub source: String, pub destination: String,
    pub source_port: Option<u16>, pub destination_port: Option<u16>, pub protocol: String,
    pub layers: Vec<String>, pub info: String, pub details: Vec<String>,
    pub tcp_seq: Option<u32>, pub tcp_flags: u8, pub payload: Vec<u8>, pub stream: Option<u64>,
}
fn u16be(b: &[u8], o: usize) -> Option<u16> { Some(u16::from_be_bytes(b.get(o..o+2)?.try_into().ok()?)) }
fn u32be(b: &[u8], o: usize) -> Option<u32> { Some(u32::from_be_bytes(b.get(o..o+4)?.try_into().ok()?)) }
fn word(b: &[u8], o: usize, le: bool) -> Result<u32, String> {
    let v: [u8;4] = b.get(o..o+4).ok_or("Truncated capture header")?.try_into().unwrap();
    Ok(if le { u32::from_le_bytes(v) } else { u32::from_be_bytes(v) })
}
fn half(b: &[u8], o: usize, le: bool) -> Result<u16, String> {
    let v: [u8;2] = b.get(o..o+2).ok_or("Truncated capture header")?.try_into().unwrap();
    Ok(if le { u16::from_le_bytes(v) } else { u16::from_be_bytes(v) })
}

pub fn read_capture(bytes: &[u8], growing: bool) -> Result<Vec<Frame>, String> {
    if bytes.len() > MAX_BYTES { return Err("Capture exceeds 64 MiB".into()); }
    if bytes.len() < 4 { return if growing { Ok(vec![]) } else { Err("Empty or incomplete capture".into()) }; }
    if bytes[..4] == [0x0a,0x0d,0x0d,0x0a] { return read_pcapng(bytes, growing); }
    let (le, scale) = match &bytes[..4] {
        [0xd4,0xc3,0xb2,0xa1] => (true, 1e6), [0xa1,0xb2,0xc3,0xd4] => (false, 1e6),
        [0x4d,0x3c,0xb2,0xa1] => (true, 1e9), [0xa1,0xb2,0x3c,0x4d] => (false, 1e9),
        _ => return Err("Native reader supports PCAP and PCAPNG files.".into()),
    };
    if bytes.len() < 24 { return if growing { Ok(vec![]) } else { Err("Incomplete PCAP header".into()) }; }
    if half(bytes,4,le)? != 2 || half(bytes,6,le)? != 4 { return Err("Unsupported PCAP version (expected 2.4)".into()); }
    let link = word(bytes,20,le)? & 0xffff;
    let mut offset = 24; let mut frames = Vec::new();
    while offset < bytes.len() {
        if bytes.len()-offset < 16 { if growing { break; } return Err("Truncated PCAP record header".into()); }
        let sec = word(bytes,offset,le)?; let fractional = word(bytes,offset+4,le)?;
        if fractional as f64 >= scale { return Err("Invalid PCAP fractional timestamp".into()); }
        let length = word(bytes,offset+8,le)? as usize; let wire_len = word(bytes,offset+12,le)?;
        offset += 16;
        if length > wire_len as usize || length > MAX_BYTES { return Err("Invalid PCAP record length".into()); }
        if length > bytes.len()-offset { if growing { break; } return Err("Truncated PCAP packet data".into()); }
        if frames.len() >= MAX_PACKETS { return Err("Capture exceeds 100,000 packets; split the file.".into()); }
        frames.push(Frame { number: frames.len() as u64+1, timestamp: Some(sec as f64+fractional as f64/scale), link, wire_len, data: bytes[offset..offset+length].to_vec() });
        offset += length;
    }
    Ok(frames)
}

fn read_pcapng(bytes: &[u8], growing: bool) -> Result<Vec<Frame>, String> {
    let mut offset = 0; let mut le = true; let mut interfaces: Vec<(u32,u32,f64,i64)> = Vec::new(); let mut frames = Vec::new();
    while offset < bytes.len() {
        if bytes.len()-offset < 12 { if growing { break; } return Err("Truncated PCAPNG block".into()); }
        let b = &bytes[offset..];
        let section = b[..4] == [0x0a,0x0d,0x0d,0x0a];
        if section { le = match &b[8..12] { [0x4d,0x3c,0x2b,0x1a] => true, [0x1a,0x2b,0x3c,0x4d] => false, _ => return Err("Invalid PCAPNG byte order".into()) }; }
        let length = word(b,4,le)? as usize;
        if length < 12 || length % 4 != 0 || length > MAX_BYTES { return Err("Invalid PCAPNG block length".into()); }
        if length > b.len() { if growing { break; } return Err("Incomplete PCAPNG block".into()); }
        let b = &b[..length];
        if word(b,length-4,le)? as usize != length { return Err("PCAPNG block trailer mismatch".into()); }
        let kind = word(b,0,le)?;
        if section {
            if length < 28 || half(b,12,le)? != 1 { return Err("Unsupported PCAPNG section".into()); }
            interfaces.clear();
        } else if kind == 1 {
            if length < 20 { return Err("Incomplete PCAPNG interface".into()); }
            let mut resolution = 1e-6; let mut shift = 0i64; let mut pos = 16;
            while pos+4 <= length-4 {
                let code = half(b,pos,le)?; let size = half(b,pos+2,le)? as usize; pos += 4;
                if size > length-4-pos { return Err("Invalid PCAPNG option length".into()); }
                if code == 0 { break; }
                if code == 9 && size == 1 { let n=b[pos]; resolution = if n&128 != 0 { 2f64.powi(-((n&127) as i32)) } else { 10f64.powi(-(n as i32)) }; }
                if code == 14 && size == 8 { let v=b[pos..pos+8].try_into().unwrap(); shift=if le { i64::from_le_bytes(v) } else { i64::from_be_bytes(v) }; }
                pos += (size+3)&!3;
            }
            interfaces.push((half(b,8,le)? as u32,word(b,12,le)?,resolution,shift));
        } else if kind == 6 || kind == 3 {
            let (link, snap, resolution, shift, start, captured, wire_len, timestamp) = if kind == 6 {
                if length < 32 { return Err("Incomplete enhanced packet block".into()); }
                let (link,snap,res,shift)=*interfaces.get(word(b,8,le)? as usize).ok_or("PCAPNG references an unknown interface")?;
                let ticks=((word(b,12,le)? as u64)<<32)|word(b,16,le)? as u64;
                (link,snap,res,shift,28,word(b,20,le)? as usize,word(b,24,le)?,Some(ticks as f64*res+shift as f64))
            } else {
                if length < 16 { return Err("Incomplete simple packet block".into()); }
                let (link,snap,res,shift)=*interfaces.first().ok_or("PCAPNG packet has no interface")?;
                let original=word(b,8,le)?; let count=if snap==0 { original } else { original.min(snap) };
                (link,snap,res,shift,12,count as usize,original,None)
            };
            let _ = (resolution,shift);
            if captured > wire_len as usize || (snap > 0 && captured > snap as usize) || start+((captured+3)&!3) > length-4 { return Err("Invalid PCAPNG captured length".into()); }
            if frames.len() >= MAX_PACKETS { return Err("Capture exceeds 100,000 packets; split the file.".into()); }
            frames.push(Frame { number: frames.len() as u64+1, timestamp, link, wire_len, data: b[start..start+captured].to_vec() });
        } else if kind == 2 { return Err("Obsolete PCAPNG packet blocks are not supported; use enhanced packet blocks.".into()); }
        offset += length;
    }
    Ok(frames)
}

fn mac(b: &[u8]) -> String { b.iter().map(|n| format!("{n:02x}")).collect::<Vec<_>>().join(":") }
fn name(dns: &[u8], start: usize) -> Option<(String,usize)> {
    let mut pos=start; let mut end=None; let mut labels=Vec::new(); let mut visited=std::collections::HashSet::new();
    for _ in 0..128 {
        if !visited.insert(pos) { return None; }
        let size=*dns.get(pos)? as usize;
        if size==0 { return Some((labels.join("."),end.unwrap_or(pos+1))); }
        if size&0xc0==0xc0 { let target=((size&63)<<8)|*dns.get(pos+1)? as usize; if end.is_none() { end=Some(pos+2); } pos=target; continue; }
        if size>63 { return None; }
        let label=std::str::from_utf8(dns.get(pos+1..pos+1+size)?).ok()?;
        labels.push(label.to_string()); pos+=1+size;
        if labels.iter().map(String::len).sum::<usize>()>253 { return None; }
    }
    None
}

pub fn analyze(frames: Vec<Frame>) -> Vec<Packet> {
    let base=frames.iter().find_map(|f| f.timestamp);
    let mut streams: std::collections::HashMap<(String,String), (u64,Option<u32>)> = std::collections::HashMap::new(); let mut next=0;
    frames.into_iter().map(|frame| {
        let mut packet=decode(frame,base);
        if packet.tcp_seq.is_some() {
            let a=format!("{}:{}",packet.source,packet.source_port.unwrap_or(0)); let b=format!("{}:{}",packet.destination,packet.destination_port.unwrap_or(0));
            let key=if a<=b { (a,b) } else { (b,a) };
            let syn=packet.tcp_flags&0x12==0x02;
            let entry=streams.entry(key).or_insert_with(|| { next+=1;(next,None) });
            if syn && entry.1.is_some() && entry.1!=packet.tcp_seq { next+=1; *entry=(next,None); }
            if syn { entry.1=packet.tcp_seq; }
            packet.stream=Some(entry.0);
        }
        packet
    }).collect()
}

fn decode(frame: Frame, base: Option<f64>) -> Packet {
    let mut p=Packet { time: frame.timestamp.zip(base).map(|(t,b)|t-b), frame, source:String::new(),destination:String::new(),source_port:None,destination_port:None,protocol:"Unknown".into(),layers:vec![],info:String::new(),details:vec![],tcp_seq:None,tcp_flags:0,payload:vec![],stream:None };
    if let Err(error)=decode_layers(&mut p) { p.details.push(error.clone()); p.info=format!("{}{}", if p.info.is_empty() { "" } else { "Incomplete decode: " }, error); }
    if p.frame.data.len() < p.frame.wire_len as usize { p.details.push("Capture truncated: fewer bytes saved than reported on wire.".into()); }
    p
}

fn decode_layers(p: &mut Packet) -> Result<(),String> {
    let b=&p.frame.data;
    let (mut ether,mut offset)=match p.frame.link {
        1 => { if b.len()<14 { return Err("Incomplete Ethernet header".into()); } p.source=mac(&b[6..12]);p.destination=mac(&b[..6]);p.layers.push("ethernet".into()); (u16be(b,12).unwrap(),14) }
        113 => { if b.len()<16 { return Err("Incomplete Linux cooked header".into()); } p.layers.push("sll".into()); (u16be(b,14).unwrap(),16) }
        276 => { if b.len()<20 { return Err("Incomplete Linux cooked v2 header".into()); } p.layers.push("sll2".into()); (u16be(b,0).unwrap(),20) }
        101 | 228 | 229 => { let version=b.first().ok_or("Empty IP packet")? >> 4; (if version==4 {0x0800} else if version==6 {0x86dd} else {0},0) }
        0 | 108 => { if b.len()<5 { return Err("Incomplete loopback header".into()); } (match b[4]>>4 { 4=>0x0800,6=>0x86dd,_=>0 },4) }
        link => return Err(format!("Unsupported link type {link}; original bytes preserved")),
    };
    for _ in 0..4 {
        if ether!=0x8100 && ether!=0x88a8 { break; }
        let tag=u16be(b,offset).ok_or("Truncated VLAN header")?; ether=u16be(b,offset+2).ok_or("Truncated VLAN header")?;
        p.details.push(format!("VLAN ID: {}",tag&0xfff));p.layers.push("vlan".into());offset+=4;
    }
    if ether==0x0806 {
        p.protocol="ARP".into();p.layers.push("arp".into());
        let a=b.get(offset..).ok_or("Missing ARP data")?;
        if a.len()<28 || a[4]!=6 || a[5]!=4 || u16be(a,2)!=Some(0x0800) { return Err("Unsupported or incomplete ARP address format".into()); }
        p.source=Ipv4Addr::new(a[14],a[15],a[16],a[17]).to_string(); p.destination=Ipv4Addr::new(a[24],a[25],a[26],a[27]).to_string();
        p.info=format!("ARP operation {}: {} → {}",u16be(a,6).unwrap(),p.source,p.destination);
        p.details.push(format!("Sender MAC: {}\nTarget MAC: {}",mac(&a[8..14]),mac(&a[18..24])));return Ok(());
    }
    let (mut next,mut cursor,end)=if ether==0x0800 {
        let ip=b.get(offset..).ok_or("Missing IPv4 data")?;
        if ip.len()<20 || ip[0]>>4!=4 { return Err("Incomplete IPv4 header".into()); }
        let ihl=(ip[0]&15) as usize*4; let length=u16be(ip,2).unwrap() as usize;
        if ihl<20 || ihl>ip.len() || length<ihl { return Err("Invalid IPv4 header length".into()); }
        p.source=Ipv4Addr::new(ip[12],ip[13],ip[14],ip[15]).to_string();p.destination=Ipv4Addr::new(ip[16],ip[17],ip[18],ip[19]).to_string();p.protocol="IPv4".into();p.layers.push("ip".into());
        p.details.push(format!("IPv4 · header {ihl} bytes · total {length} bytes · TTL {}",ip[8]));
        if length>ip.len(){p.details.push("IPv4 payload is shorter than its declared length.".into());}
        if u16be(ip,6).unwrap()&0x3fff!=0 { p.info="IPv4 fragment; fragment reassembly not yet supported".into();return Ok(()); }
        (ip[9],offset+ihl,(offset+length).min(b.len()))
    } else if ether==0x86dd {
        let ip=b.get(offset..).ok_or("Missing IPv6 data")?;
        if ip.len()<40 || ip[0]>>4!=6 { return Err("Incomplete IPv6 header".into()); }
        p.source=Ipv6Addr::from(<[u8;16]>::try_from(&ip[8..24]).unwrap()).to_string();p.destination=Ipv6Addr::from(<[u8;16]>::try_from(&ip[24..40]).unwrap()).to_string();p.protocol="IPv6".into();p.layers.push("ipv6".into());
        let length=u16be(ip,4).unwrap() as usize;
        if length==0 { return Err("IPv6 jumbograms are not supported".into()); }
        p.details.push(format!("IPv6 · payload {length} bytes · hop limit {}",ip[7]));
        if 40+length>ip.len(){p.details.push("IPv6 payload is shorter than its declared length.".into());}
        (ip[6],offset+40,(offset+40+length).min(b.len()))
    } else { p.info=format!("EtherType 0x{ether:04x}; undecoded payload");return Ok(()); };
    for _ in 0..8 {
        if next==44 { p.info="IPv6 fragment; fragment reassembly not yet supported".into();return Ok(()); }
        if ![0,43,60,51].contains(&next) { break; }
        let extension=b.get(cursor..end).ok_or("Truncated IPv6 extension")?;
        if extension.len()<2 { return Err("Truncated IPv6 extension".into()); }
        let size=if next==51 {(extension[1] as usize+2)*4} else {(extension[1] as usize+1)*8};
        if size>extension.len() { return Err("Invalid IPv6 extension length".into()); }
        next=extension[0];cursor+=size;
    }
    let transport=b.get(cursor..end).ok_or("Truncated transport header")?;
    let mut payload=&[][..];
    if next==6 {
        if transport.len()<20 { return Err("Incomplete TCP header".into()); }
        let size=(transport[12]>>4) as usize*4;
        if size<20 || size>transport.len() { return Err("Invalid TCP header length".into()); }
        p.source_port=u16be(transport,0);p.destination_port=u16be(transport,2);p.tcp_seq=u32be(transport,4);p.tcp_flags=transport[13];p.protocol="TCP".into();p.layers.push("tcp".into());
        let flags=[(2,"SYN"),(16,"ACK"),(1,"FIN"),(4,"RST"),(8,"PSH"),(32,"URG")].into_iter().filter(|(mask,_)|p.tcp_flags&mask!=0).map(|(_,s)|s).collect::<Vec<_>>().join(", ");
        p.info=format!("{} → {} [{flags}] Seq={} Ack={} Payload={} bytes",p.source_port.unwrap(),p.destination_port.unwrap(),p.tcp_seq.unwrap(),u32be(transport,8).unwrap(),transport.len()-size);
        p.details.push(format!("TCP · {flags}\nSequence: {}\nAcknowledgment: {}\nWindow: {}",p.tcp_seq.unwrap(),u32be(transport,8).unwrap(),u16be(transport,14).unwrap()));payload=&transport[size..];
    } else if next==17 {
        if transport.len()<8 { return Err("Incomplete UDP header".into()); }
        let length=u16be(transport,4).unwrap() as usize;if length<8 {return Err("Invalid UDP length".into());}
        if length>transport.len(){p.details.push("UDP datagram is shorter than its declared length.".into());}
        p.source_port=u16be(transport,0);p.destination_port=u16be(transport,2);p.protocol="UDP".into();p.layers.push("udp".into());
        p.info=format!("{} → {} · UDP length {length} bytes",p.source_port.unwrap(),p.destination_port.unwrap());payload=&transport[8..length.min(transport.len())];
    } else if next==1 || next==58 {
        if transport.len()<4 {return Err("Incomplete ICMP header".into());}
        p.protocol=if next==1 {"ICMP"} else {"ICMPv6"}.into();p.layers.push(p.protocol.to_lowercase());p.info=format!("{} type {} code {}",p.protocol,transport[0],transport[1]);
    } else { p.info=format!("IP protocol {next}; payload not decoded"); }
    p.payload=payload.to_vec();
    if p.source_port==Some(53) || p.destination_port==Some(53) || p.source_port==Some(5353) || p.destination_port==Some(5353) {
        let dns=if next==6 { if payload.len()<2 { return Ok(()); } let size=u16be(payload,0).unwrap() as usize; if payload.len()<size+2 { p.details.push("DNS-over-TCP message is segmented; no application reassembly yet.".into());return Ok(()); } &payload[2..2+size] } else {payload};
        if dns.len()>=12 {
            let questions=u16be(dns,4).unwrap();let flags=u16be(dns,2).unwrap();let response=flags&0x8000!=0;
            let question=if questions>0 {let (value,end)=name(dns,12).ok_or("Invalid DNS question/compression pointer")?;let class=u16be(dns,end+2).ok_or("Truncated DNS question class")?;format!("{value} · type {} · class {class}",u16be(dns,end).ok_or("Truncated DNS question type")?)} else {"No questions".into()};
            p.protocol="DNS".into();p.layers.push("dns".into());p.info=format!("DNS {} · {question} · rcode {}",if response {"response"} else {"query"},flags&15);
            p.details.push(format!("DNS ID: {}\nQuestions: {questions}\nAnswers: {}\nResponse: {response}",u16be(dns,0).unwrap(),u16be(dns,6).unwrap()));
        }
    }
    if next==6 && !payload.is_empty() {
        if let Some(line)=payload.split(|c|*c==b'\n').next().and_then(|s|std::str::from_utf8(s).ok()) {
            if ["GET ","POST ","HEAD ","PUT ","DELETE ","OPTIONS ","PATCH ","CONNECT ","HTTP/1."].iter().any(|prefix|line.starts_with(prefix)) {
                p.protocol="HTTP".into();p.layers.push("http".into());p.info=line.trim().chars().take(240).collect();p.details.push(format!("HTTP start line: {}",p.info));
            }
        }
        if payload.len()>=5 && (20..=23).contains(&payload[0]) && payload[1]==3 && payload[2]<=4 {
            let size=u16be(payload,3).unwrap();p.protocol="TLS".into();p.layers.push("tls".into());p.info=format!("TLS record · content type {} · legacy version 0x03{:02x} · {size} bytes",payload[0],payload[2]);
            p.details.push("TLS legacy record version is not proof of the negotiated TLS version. Encrypted content remains opaque.".into());
            if size as usize+5>payload.len() {p.details.push("TLS record spans packets or was truncated; no application reassembly yet.".into());}
        }
    }
    Ok(())
}

pub fn dissection(p: &Packet) -> String {
    let mut text=format!("Capture Buddy native engine\nPacket {}\nLink type: {}\nCaptured bytes: {}\nReported wire bytes: {}\nTimestamp (epoch seconds): {:?}\nPath: {} → {}\nDecoded layers: {}\n{}\n{}\n\n",p.frame.number,p.frame.link,p.frame.data.len(),p.frame.wire_len,p.frame.timestamp,p.source,p.destination,p.layers.join(" → "),p.info,p.details.join("\n"));
    for (index,chunk) in p.frame.data.chunks(16).enumerate() {
        text.push_str(&format!("{:04x}  {:47}  {}\n",index*16,chunk.iter().map(|b|format!("{b:02x}")).collect::<Vec<_>>().join(" "),chunk.iter().map(|&b|if (32..127).contains(&b) {b as char} else {'.'}).collect::<String>()));
    }
    text
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    pub fn dns_packet()->Vec<u8>{
        let mut dns=vec![0x12,0x34,1,0,0,1,0,0,0,0,0,0];dns.extend(b"\x07example\x03com\x00\x00\x01\x00\x01");
        let mut b=vec![0u8;42];b[12..14].copy_from_slice(&[8,0]);b[14]=0x45;b[16..18].copy_from_slice(&((28+dns.len())as u16).to_be_bytes());b[22]=64;b[23]=17;
        b[26..30].copy_from_slice(&[192,0,2,1]);b[30..34].copy_from_slice(&[192,0,2,2]);b[34..36].copy_from_slice(&12345u16.to_be_bytes());b[36..38].copy_from_slice(&53u16.to_be_bytes());b[38..40].copy_from_slice(&((8+dns.len())as u16).to_be_bytes());b.extend(dns);b
    }
    pub fn capture_bytes(link:u32,packets:&[Vec<u8>])->Vec<u8>{
        let mut b=Vec::new();b.extend(0xa1b2c3d4u32.to_le_bytes());b.extend(2u16.to_le_bytes());b.extend(4u16.to_le_bytes());for n in [0u32,0,65535,link]{b.extend(n.to_le_bytes());}
        for (i,p) in packets.iter().enumerate(){for n in [i as u32+1,0,p.len()as u32,p.len()as u32]{b.extend(n.to_le_bytes());}b.extend(p);}b
    }
    pub fn tcp_packet(seq:u32,flags:u8,payload:&[u8])->Vec<u8>{
        let mut b=dns_packet()[..34].to_vec();b[23]=6;b[16..18].copy_from_slice(&((40+payload.len())as u16).to_be_bytes());
        let mut tcp=vec![0u8;20];tcp[..2].copy_from_slice(&12345u16.to_be_bytes());tcp[2..4].copy_from_slice(&80u16.to_be_bytes());tcp[4..8].copy_from_slice(&seq.to_be_bytes());tcp[12]=0x50;tcp[13]=flags;b.extend(tcp);b.extend(payload);b
    }
    #[test]fn tcp_http_tls_and_connection_generations(){
        let packets=vec![tcp_packet(10,2,&[]),tcp_packet(11,16,b"GET / HTTP/1.1\r\nHost: example.com\r\n\r\n"),tcp_packet(100,2,&[]),tcp_packet(101,16,&[22,3,3,0,4,1,0,0,0])];
        let decoded=analyze(read_capture(&capture_bytes(1,&packets),false).unwrap());
        assert_eq!(decoded[1].protocol,"HTTP");assert_eq!(decoded[3].protocol,"TLS");assert_eq!(decoded[0].stream,decoded[1].stream);assert_ne!(decoded[1].stream,decoded[2].stream);
    }
    #[test]fn ipv6_extensions_and_vlan_are_decoded(){
        let packet=dns_packet();let mut v6=packet[..14].to_vec();v6[12..14].copy_from_slice(&[0x86,0xdd]);let mut header=vec![0u8;40];header[0]=0x60;header[4..6].copy_from_slice(&((packet.len()-34+8)as u16).to_be_bytes());header[6]=0;header[7]=64;header[23]=1;header[39]=2;v6.extend(header);v6.extend([17,0,0,0,0,0,0,0]);v6.extend(&packet[34..]);
        let mut vlan=packet[..12].to_vec();vlan.extend([0x81,0,0,7,8,0]);vlan.extend(&packet[14..]);
        let decoded=analyze(read_capture(&capture_bytes(1,&[v6,vlan]),false).unwrap());assert_eq!(decoded[0].source,"::1");assert_eq!(decoded[0].protocol,"DNS");assert_eq!(decoded[1].protocol,"DNS");assert!(decoded[1].layers.contains(&"vlan".into()));
    }
    #[test]fn native_dns_read_search_and_detail(){
        let data=capture_bytes(1,&[dns_packet(),dns_packet()]);let packets=analyze(read_capture(&data,false).unwrap());
        assert_eq!(packets[0].protocol,"DNS");assert_eq!(packets[0].source,"192.0.2.1");assert!(packets[0].info.contains("example.com"));assert_eq!(packets[1].time,Some(1.0));
        let query=crate::services::buddy_search::compile("dns port:53 from:192.0.2.1 time:>0 text:example.com").unwrap();
        assert!(!query.matches(&packets[0]));assert!(query.matches(&packets[1]));assert!(dissection(&packets[0]).contains("0000"));
    }
    #[test]fn malformed_and_growing_records_are_distinct(){
        let mut b=capture_bytes(1,&[dns_packet()]);b.pop();assert!(read_capture(&b,false).is_err());assert!(read_capture(&b,true).unwrap().is_empty());
        b[32..36].copy_from_slice(&u32::MAX.to_le_bytes());assert!(read_capture(&b,true).is_err());
        assert!(name(&[0xc0,0],0).is_none());
    }
    #[test]fn pcap_big_endian_and_nanoseconds(){
        let packet=dns_packet();let mut b=vec![0xa1,0xb2,0x3c,0x4d,0,2,0,4];for n in [0u32,0,65535,1,5,500_000_000,packet.len()as u32,packet.len()as u32]{b.extend(n.to_be_bytes());}b.extend(packet);
        assert_eq!(read_capture(&b,false).unwrap()[0].timestamp,Some(5.5));
    }
    fn block(kind:u32,mut body:Vec<u8>)->Vec<u8>{while body.len()%4!=0{body.push(0);}let n=body.len()as u32+12;let mut b=Vec::new();b.extend(kind.to_le_bytes());b.extend(n.to_le_bytes());b.extend(body);b.extend(n.to_le_bytes());b}
    #[test]fn pcapng_enhanced_and_simple_packets_preserve_unknown_time(){
        let mut section=vec![0x4d,0x3c,0x2b,0x1a,1,0,0,0];section.extend([255;8]);let mut file=block(0x0a0d0d0a,section);
        let mut interface=vec![1,0,0,0];interface.extend(65535u32.to_le_bytes());file.extend(block(1,interface));
        let packet=dns_packet();let mut body=Vec::new();for n in [0u32,0,2_000_000,packet.len()as u32,packet.len()as u32]{body.extend(n.to_le_bytes());}body.extend(&packet);file.extend(block(6,body));
        let mut body=(packet.len()as u32).to_le_bytes().to_vec();body.extend(&packet);file.extend(block(3,body));
        let frames=read_capture(&file,false).unwrap();assert_eq!(frames.len(),2);assert_eq!(frames[0].timestamp,Some(2.0));assert_eq!(frames[1].timestamp,None);assert_eq!(analyze(frames)[1].protocol,"DNS");
        let last=file.len()-1;file[last]^=1;assert!(read_capture(&file,false).is_err());
    }
    #[test]fn cooked_and_raw_links_decode_without_ethernet_assumptions(){
        let packet=dns_packet();let ip=&packet[14..];
        for link in [101,113,276,0]{let data=match link{113=>{let mut v=vec![0u8;16];v[14]=8;v.extend(ip);v},276=>{let mut v=vec![0u8;20];v[0]=8;v.extend(ip);v},0=>{let mut v=vec![2,0,0,0];v.extend(ip);v},_=>ip.to_vec()};let decoded=analyze(read_capture(&capture_bytes(link,&[data]),false).unwrap());assert_eq!(decoded[0].protocol,"DNS","{link}");}
    }
    #[test]fn truncated_and_arbitrary_frames_never_panic(){
        let packet=dns_packet();for size in 0..packet.len(){let _=analyze(vec![Frame{number:1,timestamp:None,link:1,wire_len:packet.len()as u32,data:packet[..size].to_vec()}]);}
        let mut seed=7u32;for link in [0,1,101,113,276,999]{for size in 0..256 {let data=(0..size).map(|_|{seed=seed.wrapping_mul(1664525).wrapping_add(1013904223);(seed>>24)as u8}).collect();let _=analyze(vec![Frame{number:1,timestamp:None,link,wire_len:size as u32,data}]);}}
    }
}
