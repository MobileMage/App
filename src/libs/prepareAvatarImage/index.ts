import type PrepareAvatarImage from './types';

// No preparation is needed on web: the browser rasterizes SVGs natively, so the resolution check
// reads real intrinsic dimensions and the avatar crop screen already saves SVGs as a PNG blob.
const prepareAvatarImage: PrepareAvatarImage = (image) => Promise.resolve(image);

export default prepareAvatarImage;
