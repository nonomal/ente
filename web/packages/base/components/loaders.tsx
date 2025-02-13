import { Stack100vhCenter } from "@/base/components/containers";
import { ActivityIndicator } from "@/base/components/mui/ActivityIndicator";
import { Backdrop } from "@mui/material";
import React from "react";

/**
 * A centered activity indicator shown in a container that fills up the entire
 * width and height of the viewport.
 *
 * This is meant as a root component of a page, e.g., during initial load.
 */
export const LoadingIndicator: React.FC = () => (
    <Stack100vhCenter>
        <ActivityIndicator />
    </Stack100vhCenter>
);

/**
 * An translucent overlay that covers the entire viewport and shows an activity
 * indicator in its center.
 *
 * Used as a overlay during blocking actions. The use of this component is not
 * recommended for new code.
 */
export const TranslucentLoadingOverlay: React.FC = () => (
    <Backdrop
        // Specifying open here causes us to lose animations. This is not
        // optimal, but fine for now since this the use of this is limited to a
        // few interstitial overlays, and if refactoring consider replacing this
        // entirely with a more localized activity indicator.
        open={true}
        sx={{
            backgroundColor: "var(--mui-palette-backdrop-muted)",
            backdropFilter: "blur(30px) opacity(95%)",
            // This is `aboveFileViewerContentZ + delta`. Cannot use a constant
            // here since this is used outside photos too. Eventually just get
            // rid of this component, merging it to specific uses.
            zIndex: 2000 /* aboveFileViewerContentZ + delta */,
        }}
    >
        <ActivityIndicator />
    </Backdrop>
);
