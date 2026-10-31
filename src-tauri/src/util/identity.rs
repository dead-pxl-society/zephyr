use std::path::Path;

use iroh::SecretKey;

use crate::error::{Error, Result};

const KEY_FILE: &str = "identity.key";

/// The endpoint secret key is the device's identity: contacts, blocks and
/// family membership are all bound to its public half. It is generated
/// randomly on first launch and kept in the app data directory, readable only
/// by the current user, so it survives reinstalls but never leaves the machine.
pub async fn load_or_create_secret_key(data_dir: &Path) -> Result<SecretKey> {
    tokio::fs::create_dir_all(data_dir).await?;
    let path = data_dir.join(KEY_FILE);

    match tokio::fs::read_to_string(&path).await {
        Ok(contents) => parse_key(contents.trim()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let key = SecretKey::generate();
            write_key(&path, &key).await?;
            Ok(key)
        }
        Err(e) => Err(e.into()),
    }
}

fn parse_key(hex_str: &str) -> Result<SecretKey> {
    let bytes = hex::decode(hex_str).map_err(|_| Error::InvalidIdentityKey)?;
    let bytes: [u8; 32] = bytes.try_into().map_err(|_| Error::InvalidIdentityKey)?;
    Ok(SecretKey::from(bytes))
}

async fn write_key(path: &Path, key: &SecretKey) -> Result<()> {
    let encoded = hex::encode(key.to_bytes());

    #[cfg(unix)]
    {
        use tokio::io::AsyncWriteExt;

        let mut file = tokio::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(path)
            .await?;
        file.write_all(encoded.as_bytes()).await?;
        file.flush().await?;
    }

    #[cfg(not(unix))]
    {
        tokio::fs::write(path, encoded).await?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn key_is_created_once_and_reloaded() {
        let dir = std::env::temp_dir().join(format!("zephyr-identity-{}", rand::random::<u64>()));

        let first = load_or_create_secret_key(&dir).await.unwrap();
        let second = load_or_create_secret_key(&dir).await.unwrap();
        assert_eq!(first.public(), second.public());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_malformed_keys() {
        assert!(parse_key("not hex").is_err());
        assert!(parse_key("abcd").is_err());
    }
}
