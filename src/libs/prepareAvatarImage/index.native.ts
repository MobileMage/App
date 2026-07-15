import {splitExtensionFromFileName} from '@libs/fileDownload/FileUtils';

import CONST from '@src/CONST';
import type {FileObject} from '@src/types/utils/Attachment';

import {ImageFormat, Skia} from '@shopify/react-native-skia';
import RNFS from 'react-native-fs';

import type PrepareAvatarImage from './types';

// Raster size for SVGs that declare no usable intrinsic dimensions (e.g. only a viewBox or
// percentage sizes). Vector art scales losslessly, so any size within the avatar resolution
// bounds is correct; this mirrors how browsers assign a default intrinsic size on web.
const DEFAULT_RASTER_SIZE = 512;

function isSvgImage(image: FileObject): boolean {
    const {fileExtension} = splitExtensionFromFileName(image?.name ?? '');
    return fileExtension.toLowerCase() === 'svg' || !!image.type?.includes('svg');
}

/**
 * Rasterizes a picked SVG to a PNG file so the rest of the avatar pipeline can process it.
 * The native image stack only decodes raster formats: the picker leaves SVGs without
 * width/height (failing the resolution check), react-native-image-size rejects on the crop
 * screen and expo-image-manipulator cannot crop a vector. Rendering the SVG with Skia up
 * front gives native the same shape web already produces, where the browser rasterizes the
 * SVG and the crop screen saves it as a PNG blob. Non-SVG files resolve unchanged.
 */
const prepareAvatarImage: PrepareAvatarImage = async (image) => {
    if (!isSvgImage(image) || !image.uri) {
        return image;
    }

    const svgXML = await fetch(image.uri).then((response) => response.text());
    const svg = Skia.SVG.MakeFromString(svgXML);
    if (!svg) {
        throw new Error('Failed to parse SVG');
    }

    let surface = null;
    let snapshot = null;
    try {
        // Rasterize at the intrinsic size so a genuinely undersized vector still fails the
        // minimum-resolution check the same way it does on web, and cap at the avatar maximum
        // so an oversized canvas cannot fail validation or exhaust memory.
        const intrinsicWidth = svg.width();
        const intrinsicHeight = svg.height();
        const hasIntrinsicSize = intrinsicWidth > 0 && intrinsicHeight > 0;
        const scale = hasIntrinsicSize ? Math.min(1, CONST.AVATAR_MAX_WIDTH_PX / intrinsicWidth, CONST.AVATAR_MAX_HEIGHT_PX / intrinsicHeight) : 1;
        const width = hasIntrinsicSize ? Math.max(1, Math.round(intrinsicWidth * scale)) : DEFAULT_RASTER_SIZE;
        const height = hasIntrinsicSize ? Math.max(1, Math.round(intrinsicHeight * scale)) : DEFAULT_RASTER_SIZE;

        surface = Skia.Surface.MakeOffscreen(width, height) ?? Skia.Surface.Make(width, height);
        if (!surface) {
            throw new Error('Failed to create Skia surface');
        }

        const canvas = surface.getCanvas();
        if (hasIntrinsicSize) {
            canvas.scale(scale, scale);
            canvas.drawSvg(svg);
        } else {
            // Without an intrinsic size the root SVG resolves percentage dimensions against the
            // container, so passing the target size here makes the drawing fill the surface.
            canvas.drawSvg(svg, width, height);
        }
        surface.flush();

        snapshot = surface.makeImageSnapshot();
        const base64 = snapshot.encodeToBase64(ImageFormat.PNG, 100);

        const filePath = `${RNFS.TemporaryDirectoryPath}/avatar-${Date.now()}.png`;
        await RNFS.writeFile(filePath, base64, 'base64');
        const {size} = await RNFS.stat(filePath);

        return {
            name: `${splitExtensionFromFileName(image.name ?? '').fileName || 'avatar'}.png`,
            uri: `file://${filePath}`,
            type: 'image/png',
            size,
            width,
            height,
        };
    } finally {
        svg.dispose?.();
        snapshot?.dispose?.();
        surface?.dispose?.();
    }
};

export default prepareAvatarImage;
