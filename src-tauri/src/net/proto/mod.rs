use iroh::protocol::AcceptError;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub mod device;
pub mod identity;
pub mod share;

/// Upper bound for one length-prefixed control frame. These protocols only
/// carry identities, rosters, tickets and config entries, all far below this;
/// the cap stops a peer from making us allocate whatever a u32 can name.
const MAX_FRAME_BYTES: u32 = 1024 * 1024;

#[derive(Debug, thiserror::Error)]
#[error("frame of {0} bytes exceeds the {MAX_FRAME_BYTES} byte limit")]
struct FrameTooLarge(u32);

async fn read_prefixed_bytes<R: AsyncReadExt + Unpin>(
    mut reader: R,
) -> std::result::Result<Vec<u8>, AcceptError> {
    let mut len_bytes = [0u8; 4];
    reader
        .read_exact(&mut len_bytes)
        .await
        .map_err(AcceptError::from_err)?;
    let len = u32::from_be_bytes(len_bytes);

    if len > MAX_FRAME_BYTES {
        return Err(AcceptError::from_err(FrameTooLarge(len)));
    }

    let mut data = vec![0u8; len as usize];
    reader
        .read_exact(&mut data)
        .await
        .map_err(AcceptError::from_err)?;
    Ok(data)
}

async fn write_prefixed_bytes<W: AsyncWriteExt + Unpin>(
    mut writer: W,
    data: &[u8],
) -> std::result::Result<(), AcceptError> {
    let len = data.len() as u32;
    writer
        .write_all(&len.to_be_bytes())
        .await
        .map_err(AcceptError::from_err)?;
    writer
        .write_all(data)
        .await
        .map_err(AcceptError::from_err)?;
    Ok(())
}
