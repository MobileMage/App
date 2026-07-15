import type {FileObject} from '@src/types/utils/Attachment';

/**
 * Prepares a picked image for the avatar validation and crop flow.
 * Resolves with a file the rest of the pipeline can process, or rejects if the image cannot be read.
 */
type PrepareAvatarImage = (image: FileObject) => Promise<FileObject>;

export default PrepareAvatarImage;
