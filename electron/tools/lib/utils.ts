// Polyfill DOM elements for pdf-parse in Node context
export const polyfillDOM = () => {
    if (typeof global.DOMMatrix === 'undefined') {
        // @ts-ignore
        global.DOMMatrix = class DOMMatrix {
            constructor() { }
            translate() { return this; }
            scale() { return this; }
            multiply() { return this; }
            transformPoint(p: any) { return p; }
            inverse() { return this; }
        };
    }
    if (typeof global.ImageData === 'undefined') {
        // @ts-ignore
        global.ImageData = class ImageData {
            constructor(data: any, w: any, h: any) { }
        };
    }
    if (typeof global.Path2D === 'undefined') {
        // @ts-ignore
        global.Path2D = class Path2D {
            constructor() { }
        };
    }
};
