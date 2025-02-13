/* eslint-disable */
// @ts-nocheck

import { assertionFailed } from "@/base/assert";
import log from "@/base/log";
import {
    downloadManager,
    type LivePhotoSourceURL,
} from "@/gallery/services/download";
import type { EnteFile } from "@/media/file";
import { FileType } from "@/media/file-type";
import type { FileViewerProps } from "./FileViewer5";

// TODO(PS): WIP gallery using upstream photoswipe
//
// Needs (not committed yet):
// yarn workspace gallery add photoswipe@^5.4.4
// mv node_modules/photoswipe packages/new/photos/components/ps5

if (process.env.NEXT_PUBLIC_ENTE_WIP_PS5) {
    console.warn("Using WIP upstream photoswipe");
} else {
    throw new Error("Whoa");
}

let PhotoSwipe;
if (process.env.NEXT_PUBLIC_ENTE_WIP_PS5) {
    // TODO(PS): Comment me before merging into main.
    // PhotoSwipe = require("./ps5/dist/photoswipe.esm.js").default;
}
// TODO(PS):
//import { type SlideData } from "./ps5/dist/types/slide/"
type SlideData = {
    /**
     * thumbnail element
     */
    element?: HTMLElement | undefined;
    /**
     * image URL
     */
    src?: string | undefined;
    /**
     * image srcset
     */
    srcset?: string | undefined;
    /**
     * image width (deprecated)
     */
    w?: number | undefined;
    /**
     * image height (deprecated)
     */
    h?: number | undefined;
    /**
     * image width
     */
    width?: number | undefined;
    /**
     * image height
     */
    height?: number | undefined;
    /**
     * placeholder image URL that's displayed before large image is loaded
     */
    msrc?: string | undefined;
    /**
     * image alt text
     */
    alt?: string | undefined;
    /**
     * whether thumbnail is cropped client-side or not
     */
    thumbCropped?: boolean | undefined;
    /**
     * html content of a slide
     */
    html?: string | undefined;
    /**
     * slide type
     */
    type?: string | undefined;
};

type FileViewerPhotoSwipeOptions = FileViewerProps & {
    /**
     * Called when the file viewer is closed.
     */
    onClose: () => void;
};

/**
 * A wrapper over {@link PhotoSwipe} to tailor its interface for use by our file
 * viewer.
 *
 * This is somewhat akin to the {@link PhotoSwipeLightbox}, except this doesn't
 * have any UI of its own, it only modifies PhotoSwipe Core's behaviour.
 *
 * [Note: PhotoSwipe]
 *
 * PhotoSwipe is a library that behaves similarly to the OG "lightbox" image
 * gallery JavaScript component from the middle ages.
 *
 * We don't need the lightbox functionality since we already have our own
 * thumbnail list (the "gallery"), so we only use the "Core" PhotoSwipe module
 * as our image viewer component.
 *
 * When the user clicks on one of the thumbnails in our gallery, we make the
 * root PhotoSwipe component visible. Within the DOM this is a dialog-like div
 * that takes up the entire viewport, shows the image, various controls etc.
 *
 * Documentation: https://photoswipe.com/.
 */
export class FileViewerPhotoSwipe {
    /**
     * The PhotoSwipe instance which we wrap.
     */
    private pswp: PhotoSwipe;
    /**
     * The options with which we were initialized.
     */
    private opts: Pick<FileViewerPhotoSwipeOptions, "disableDownload">;
    /**
     * The best available SlideData for rendering the file with the given ID.
     *
     * If an entry does not exist for a particular fileID, then it is lazily
     * added on demand. The same entry might get updated multiple times, as we
     * start with the thumbnail but then also update this with the original etc.
     */
    private itemDataByFileID: Map<number, SlideData> = new Map();
    /**
     * An interval that invokes a periodic check of whether we should the hide
     * controls if the user does not perform any pointer events for a while.
     */
    private autoHideCheckIntervalId: ReturnType<typeof setTimeout> | undefined;
    /**
     * The time the last activity occurred. Used in tandem with
     * {@link autoHideCheckIntervalId} to implement the auto hiding of controls
     * when the user stops moving the pointer for a while.
     *
     * Apart from a date, this can also be:
     *
     * - "already-hidden" if controls have already been hidden, say by a
     *   bgClickAction.
     *
     * - "auto-hidden" if controls were hidden by us because of inactivity.
     */
    private lastActivityDate: Date | "auto-hidden" | "already-hidden";

    constructor({
        files,
        initialIndex,
        onClose,
        disableDownload,
    }: FileViewerPhotoSwipeOptions) {
        this.files = files;
        this.opts = { disableDownload };

        const pswp = new PhotoSwipe({
            // Opaque background.
            bgOpacity: 1,
            // The default imageClickAction is "zoom-or-close". When the image
            // is small and cannot be zoomed into further (which is common when
            // just the thumbnail has been loaded), this causes PhotoSwipe to
            // close. Disable this behaviour.
            clickToCloseNonZoomable: false,
            // The default `bgClickAction` is "close", but it is not always
            // apparent where the background is and where the controls are,
            // since everything is black, and so accidentally closing PhotoSwipe
            // is easy.
            //
            // Disable this behaviour, instead repurposing this action to behave
            // the same as the `tapAction` ("tap on PhotoSwipe viewport
            // content") and toggle the visibility of UI controls (We also have
            // auto hide based on mouse activity, but that would not have any
            // effect on touch devices)
            bgClickAction: "toggle-controls",
            // At least on macOS, manual zooming with the trackpad is very
            // cumbersome (possibly because of the small multiplier in the
            // PhotoSwipe source, but I'm not sure). The other option to do a
            // manual zoom is to scroll (e.g. with the trackpad) but with the
            // CTRL key pressed, however on macOS this invokes the system zoom
            // if enabled in accessibility settings.
            //
            // Taking a step back though, the PhotoSwipe viewport is fixed, so
            // we can just directly map wheel / trackpad scrolls to zooming.
            wheelToZoom: true,
            // Set the index within files that we should open to. Subsequent
            // updates to the index will be tracked by PhotoSwipe internally.
            index: initialIndex,
            // TODO(PS): padding option? for handling custom title bar.
            // TODO(PS): will we need this?
            mainClass: "our-extra-pswp-main-class",
        });

        // Provide data about slides to PhotoSwipe via callbacks
        // https://photoswipe.com/data-sources/#dynamically-generated-data

        pswp.addFilter("numItems", () => {
            return this.files.length;
        });

        pswp.addFilter("itemData", (_, index) => {
            const file = files[index];

            let itemData: SlideData | undefined;
            if (file) {
                itemData = this.itemDataByFileID.get(file.id);
                if (!itemData) {
                    // We don't have anything to show immediately, though in
                    // most cases a cached renderable thumbnail URL will be
                    // available shortly.
                    //
                    // Meanwhile,
                    //
                    // 1. Return empty slide data; PhotoSwipe will not show
                    //    anything in the image area but will otherwise render
                    //    the surrounding UI properly.
                    //
                    // 2. Insert empty data so that we don't enqueue multiple
                    //    updates.
                    itemData = {};
                    this.itemDataByFileID.set(file.id, itemData);
                    this.enqueueUpdates(index, file);
                }
            }

            log.debug(() => ["[ps]", { itemData, index, file, itemData }]);
            if (!file) assertionFailed();

            if (this.lastActivityDate != "already-hidden")
                this.lastActivityDate = new Date();

            return itemData ?? {};
        });

        pswp.addFilter("preventPointerEvent", (originalResult) => {
            // There was a pointer event. We don't care which one, we just use
            // this as a hook to show UI again (if needed) and update our last
            // activity date.
            this.onPointerActivity();
            return originalResult;
        });

        pswp.on("contentLoad", (e) => {
            console.log("contentLoad", e);
            if (e.content.data.videoURL) {
                const holderEl = e.content.slide.holderElement;
                const vid = document.createElement("h1");
                vid.innerText = "Test 1";
                holderEl.appendChild(vid);
            }
        });
        pswp.on("contentAppend", (e) => {
            const containerEl = e.content.slide.container;
            console.log("contentAppend", containerEl);
            if (e.content.data.videoURL) {
                const vid = document.createElement("div");
                vid.innerHTML = livePhotoVideoHTML(e.content.data.videoURL);
                // vid.innerText = "Test 2";
                containerEl.appendChild(vid);
                vid.style =
                    "position: absolute; left: 0; right: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none;";
            }
        });

        pswp.on("close", () => {
            // The user did some action within the file viewer to close it.
            //
            // Clear intervals.
            clearIntervals();
            // Let our parent know that we have been closed.
            onClose();
        });

        // Initializing PhotoSwipe adds it to the DOM as a dialog-like div with
        // the class "pswp".
        pswp.init();

        this.pswp = pswp;

        this.autoHideCheckIntervalId = setInterval(() => {
            this.autoHideIfInactive();
        }, 1000);
    }

    /**
     * Close this instance of {@link FileViewerPhotoSwipe} if it hasn't itself
     * initiated the close.
     *
     * This instance **cannot** be used after this function has been called.
     */
    closeIfNeeded() {
        // Closing PhotoSwipe removes it from the DOM.
        //
        // This will only have an effect if we're being closed externally (e.g.
        // if the user selects an album in the file info).
        //
        // If this cleanup function is running in the sequence where we were
        // closed internally (e.g. the user activated the close button within
        // the file viewer), then PhotoSwipe will ignore this extra close.
        this.pswp.close();
        this.clearAutoHideIntervalIfNeeded();
    }

    updateFiles(files: EnteFile[]) {
        // TODO(PS)
    }

    private clearAutoHideIntervalIfNeeded() {
        if (this.autoHideCheckIntervalId) {
            clearInterval(this.autoHideCheckIntervalId);
            this.autoHideCheckIntervalId = undefined;
        }
    }

    private onPointerActivity() {
        if (this.lastActivityDate == "already-hidden") return;
        if (this.lastActivityDate == "auto-hidden") this.showUIControls();
        this.lastActivityDate = new Date();
    }

    private autoHideIfInactive() {
        if (this.lastActivityDate == "already-hidden") return;
        if (this.lastActivityDate == "auto-hidden") return;
        if (Date.now() - this.lastActivityDate.getTime() > 3000) {
            if (this.areUIControlsVisible()) {
                this.hideUIControls();
                this.lastActivityDate = "auto-hidden";
            } else {
                this.lastActivityDate = "already-hidden";
            }
        }
    }

    private areUIControlsVisible() {
        return this.pswp.element.classList.contains("pswp--ui-visible");
    }

    private showUIControls() {
        this.pswp.element.classList.add("pswp--ui-visible");
    }

    private hideUIControls() {
        this.pswp.element.classList.remove("pswp--ui-visible");
    }

    private async enqueueUpdates(index: number, file: EnteFile) {
        const update = (itemData: SlideData) => {
            this.itemDataByFileID.set(file.id, itemData);
            this.pswp.refreshSlideContent(index);
        };

        const thumbnailURL = await downloadManager.renderableThumbnailURL(file);
        // We don't have the dimensions of the thumbnail. We could try to deduce
        // something from the file's aspect ratio etc, but that's not needed:
        // PhotoSwipe already correctly (for our purposes) handles just a source
        // URL being present.
        update({ src: thumbnailURL });

        switch (file.metadata.fileType) {
            case FileType.image: {
                const sourceURLs =
                    await downloadManager.renderableSourceURLs(file);
                update({
                    src: sourceURLs.url,
                    width: file.pubMagicMetadata?.data?.w,
                    height: file.pubMagicMetadata?.data?.h,
                });
                break;
            }

            case FileType.video: {
                const sourceURLs =
                    await downloadManager.renderableSourceURLs(file);
                const disableDownload = !!this.opts.disableDownload;
                update({ html: videoHTML(sourceURLs.url, disableDownload) });
                break;
            }

            default: {
                const sourceURLs =
                    await downloadManager.renderableSourceURLs(file);
                const livePhotoSourceURLs =
                    sourceURLs.url as LivePhotoSourceURL;
                const imageURL = await livePhotoSourceURLs.image();
                update({
                    src: imageURL,
                    width: file.pubMagicMetadata?.data?.w,
                    height: file.pubMagicMetadata?.data?.h,
                });
                const videoURL = await livePhotoSourceURLs.video();
                console.log(videoURL);
                // update({ html: livePhotoVideoHTML(videoURL) });
                update({
                    src: imageURL,
                    width: file.pubMagicMetadata?.data?.w,
                    height: file.pubMagicMetadata?.data?.h,
                    videoURL,
                });
                break;
            }
        }
    }
}

const videoHTML = (url: string, disableDownload: boolean) => `
<video controls ${disableDownload && "controlsList=nodownload"} oncontextmenu="return false;">
  <source src="${url}" />
  Your browser does not support video playback.
</video>
`;

const livePhotoVideoHTML = (videoURL: string) => `
<video autoplay loop muted oncontextmenu="return false;">
  <source src="${videoURL}" />
</video>
`;
