use std::path::PathBuf;
use std::sync::OnceLock;

/// A file with this name next to the executable switches the app to portable mode.
const MARKER: &str = "portable";

/// Portable mode keeps everything in `data/` beside the executable: plans and settings, the cache and
/// the webview's own storage. None means a normal install, which uses the per-user app folders.
pub fn data_dir() -> Option<PathBuf> {
	static DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
	DIR.get_or_init(|| {
		let exe = std::env::current_exe().ok()?;
		let folder = exe.parent()?;
		folder.join(MARKER).is_file().then(|| folder.join("data"))
	})
	.clone()
}
