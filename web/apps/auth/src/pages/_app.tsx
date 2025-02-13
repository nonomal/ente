import { accountLogout } from "@/accounts/services/logout";
import { clientPackageName, staticAppTitle } from "@/base/app";
import { CustomHead } from "@/base/components/Head";
import {
    LoadingIndicator,
    TranslucentLoadingOverlay,
} from "@/base/components/loaders";
import { AttributedMiniDialog } from "@/base/components/MiniDialog";
import { useAttributedMiniDialog } from "@/base/components/utils/dialog";
import {
    useIsRouteChangeInProgress,
    useSetupI18n,
    useSetupLogs,
} from "@/base/components/utils/hooks-app";
import { authTheme } from "@/base/components/utils/theme";
import { logStartupBanner } from "@/base/log-web";
import HTTPService from "@ente/shared/network/HTTPService";
import { LS_KEYS, getData } from "@ente/shared/storage/localStorage";
import type { User } from "@ente/shared/user/types";
import "@fontsource-variable/inter";
import { CssBaseline } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { t } from "i18next";
import type { AppProps } from "next/app";
import React, { useCallback, useEffect, useMemo } from "react";
import { AppContext } from "types/context";

const App: React.FC<AppProps> = ({ Component, pageProps }) => {
    useSetupLogs();

    const isI18nReady = useSetupI18n();
    const isChangingRoute = useIsRouteChangeInProgress();
    const { showMiniDialog, miniDialogProps } = useAttributedMiniDialog();

    useEffect(() => {
        const user = getData(LS_KEYS.USER) as User | undefined | null;
        logStartupBanner(user?.id);
        HTTPService.setHeaders({ "X-Client-Package": clientPackageName });
    }, []);

    const logout = useCallback(() => {
        void accountLogout().then(() => window.location.replace("/"));
    }, []);

    const appContext = useMemo(
        () => ({
            logout,
            showMiniDialog,
        }),
        [logout, showMiniDialog],
    );

    const title = isI18nReady ? t("title_auth") : staticAppTitle;

    return (
        <>
            <CustomHead {...{ title }} />

            <ThemeProvider theme={authTheme}>
                <CssBaseline enableColorScheme />

                <AttributedMiniDialog {...miniDialogProps} />

                <AppContext.Provider value={appContext}>
                    {!isI18nReady ? (
                        <LoadingIndicator />
                    ) : (
                        <>
                            {isChangingRoute && <TranslucentLoadingOverlay />}
                            <Component {...pageProps} />
                        </>
                    )}
                </AppContext.Provider>
            </ThemeProvider>
        </>
    );
};

export default App;
