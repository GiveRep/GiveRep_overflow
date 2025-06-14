import { Layout } from "@/components/layout";
import LeaderboardRedirect from "@/components/LeaderboardRedirect";
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Suspense, lazy } from "react";
import { Route, Switch } from "wouter";
import { queryClient } from "./lib/queryClient";

// Lazy-loaded components (only public pages)
const NotFound = lazy(() => import("@/pages/not-found"));
const Home = lazy(() => import("@/pages/giverep/home"));
const ReputationLeaderboard = lazy(
  () => import("@/pages/giverep/reputation-leaderboard")
);
const Loyalty = lazy(() => import("@/pages/giverep/loyalty"));
const Reward = lazy(() => import("@/pages/reward"));
const MindshareDashboard = lazy(
  () => import("@/pages/giverep/mindshare-dashboard")
);

// Loading component to display while chunks are loading
const LoadingFallback = () => (
  <div className="flex flex-col items-center justify-center h-screen">
    <Loader2 className="h-10 w-10 animate-spin text-white mb-4" />
  </div>
);

import { CustomWalletProvider } from "@/context/CustomWallet";
import { TwitterAuthProviderComponent } from "@/context/TwitterAuthContext";
import { SuiWalletProvider } from "@/context/WalletProvider";
import { XWalletProvider } from "@/context/XWalletContext";
import "@mysten/dapp-kit/dist/index.css";
import { EnokiFlowProvider } from "@mysten/enoki/react";
import { AppContextProvider } from "./context/AppContext";
import { ExpandedViewProvider } from "./context/ExpandedViewContext";

import { ToastContainer } from "react-toastify";

// Create a higher-order component to wrap each route with Suspense
const LazyRoute = ({
  component: Component,
  ...rest
}: {
  component: React.ComponentType<any>;
  [key: string]: any;
}) => {
  return (
    <Route
      {...rest}
      component={(props: any) => (
        <Suspense fallback={<LoadingFallback />}>
          <Component {...props} />
        </Suspense>
      )}
    />
  );
};

function Router() {
  return (
    <Switch>
      {/* Default path uses GiveRep home */}
      <LazyRoute path="/" component={Home} />
      {/* GiveRep routes */}
      <LazyRoute path="/giverep" component={Home} />
      <LazyRoute
        path="/giverep/reputation-leaderboard"
        component={ReputationLeaderboard}
      />
      {/* Mindshare dashboard */}
      <LazyRoute path="/mindshare-dashboard" component={MindshareDashboard} />
      {/* Loyalty Program */}
      <LazyRoute path="/giverep/loyalty" component={Loyalty} />
      <LazyRoute path="/loyalty" component={Loyalty} />
      {/* User reward claiming page */}
      <LazyRoute path="/loyalty/reward" component={Reward} />
      {/* Fallback route */}
      <LazyRoute component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <AppContextProvider>
      <QueryClientProvider client={queryClient}>
        <EnokiFlowProvider apiKey={import.meta.env.VITE_ENOKI_API_KEY || ""}>
          <SuiWalletProvider>
            <CustomWalletProvider>
              <TwitterAuthProviderComponent>
                <XWalletProvider>
                  <ExpandedViewProvider>
                    <Layout>
                      <Router />
                    </Layout>
                  </ExpandedViewProvider>
                </XWalletProvider>
              </TwitterAuthProviderComponent>
            </CustomWalletProvider>
          </SuiWalletProvider>
        </EnokiFlowProvider>
        <Toaster />
        <ToastContainer
          theme="dark"
          toastStyle={{
            color: "white",
            backgroundColor: "#333",
          }}
          position="bottom-left"
        />
      </QueryClientProvider>
    </AppContextProvider>
  );
}

export default App;