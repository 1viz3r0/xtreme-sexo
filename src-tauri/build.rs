fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        assert_eq!(std::env::var("CARGO_CFG_TARGET_ENV").as_deref(), Ok("msvc"),
            "Windows packaging requires the MSVC target for optional Npcap delay-loading");
        // Scope the linker options to the GUI binary. The Linux-only helper is
        // still compiled as a cross-target package target but must not acquire
        // an Npcap delay import or the delay-load runtime dependency.
        println!("cargo:rustc-link-arg-bin=netoze-desktop=/DELAYLOAD:wpcap.dll");
        println!("cargo:rustc-link-arg-bin=netoze-desktop=/DEFAULTLIB:delayimp");
    }
    tauri_build::build()
}
