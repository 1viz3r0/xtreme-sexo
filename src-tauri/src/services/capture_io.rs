//! Descriptor-checked capture storage; nonregular inputs never block analyzer slots.
use std::{fs::{File, OpenOptions}, io, path::Path};

pub fn open_recording(path: &Path) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NONBLOCK | libc::O_NOFOLLOW | libc::O_CLOEXEC);
    }
    let file = options.open(path)?;
    if !file.metadata()?.is_file() {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "Select a regular capture file"));
    }
    Ok(file)
}

pub fn create_private_file(path: &Path) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600).custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC);
    }
    options.open(path)
}

pub fn private_capture_folder(path: &Path) -> io::Result<()> {
    let mut builder = std::fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
        let directory = OpenOptions::new().read(true)
            .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC).open(path)?;
        directory.set_permissions(std::fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::{symlink, PermissionsExt};

    #[test]
    fn rejects_fifo_device_and_symlink_without_blocking_and_keeps_files_private() {
        let mut nonce = [0u8; 16];
        getrandom::fill(&mut nonce).unwrap();
        let root = std::env::temp_dir().join(format!("capture-io-{:x}", u128::from_ne_bytes(nonce)));
        private_capture_folder(&root).unwrap();
        let fifo = root.join("fifo");
        let name = std::ffi::CString::new(fifo.as_os_str().as_encoded_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(name.as_ptr(), 0o600) }, 0);
        let before = std::time::Instant::now();
        assert!(open_recording(&fifo).is_err());
        assert!(before.elapsed() < std::time::Duration::from_secs(1));
        assert!(open_recording(Path::new("/dev/null")).is_err());
        let capture = root.join("recording.pcap");
        create_private_file(&capture).unwrap();
        assert!(open_recording(&capture).is_ok());
        assert_eq!(std::fs::metadata(&root).unwrap().permissions().mode() & 0o777, 0o700);
        assert_eq!(std::fs::metadata(&capture).unwrap().permissions().mode() & 0o777, 0o600);
        assert!(create_private_file(&capture).is_err());
        let link = root.join("link");
        symlink(&capture, &link).unwrap();
        assert!(open_recording(&link).is_err());
        assert!(create_private_file(&link).is_err());
        assert!(private_capture_folder(&link).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
