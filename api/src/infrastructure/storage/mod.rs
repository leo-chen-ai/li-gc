pub mod jdcloud_oss;
pub mod local;
pub mod provider;

pub use jdcloud_oss::JdCloudOssStorage;
pub use local::LocalStorage;
pub use provider::{StorageError, StorageProvider};
