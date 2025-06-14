// src/context/TwitterAuthContext.tsx
import React, { createContext, useContext, useState, useEffect } from "react";
import { signInWithPopup, TwitterAuthProvider, getAuth } from "firebase/auth";
import { getFirebaseApp } from "@/lib/getFirebaseApp";
import { toast } from "react-toastify";
import { useCustomWallet } from "@/context/CustomWallet";
interface TwitterAuthContextType {
  handleTwitterLogin: () => Promise<void>;
  twitterIsLogin: boolean;
  twitterCookieIsReady: boolean;
  setTwitterIsLogin: (isLoggedIn: boolean) => void;
  logoutTwitter: () => void;
  twitterUserName: string;
  twitterUserId: string;
  syncTwitterSession: () => Promise<boolean>;
}

const TwitterAuthContext = createContext<TwitterAuthContextType | undefined>(
  undefined
);

export const TwitterAuthProviderComponent: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [twitterIsLogin, setTwitterIsLogin] = useState(false);
  const [twitterCookieIsReady, setTwitterCookieIsReady] = useState(false);
  const [twitterUserName, setTwitterUserName] = useState(
    localStorage.getItem("twitterUserName") || ""
  );
  const [twitterUserId, setTwitterUserId] = useState(
    localStorage.getItem("twitterUserId") || ""
  );
  const [failFirstTimeAlready, setFailFirstTimeAlready] = useState(false);
  const { isSuiWallet } = useCustomWallet();
  const handleTwitterLogin = async () => {
    if (isSuiWallet) {
      toast.error(
        "This feature did not support Sui Wallet yet. Please use a browser and connect with Google or Stashed Wallet."
      );
      return;
    }
    const { firebaseApp } = getFirebaseApp();
    const auth = getAuth(firebaseApp);
    const provider = new TwitterAuthProvider();
    provider.addScope("tweet.read");
    provider.addScope("users.read");
    provider.addScope("follows.read");
    provider.addScope("follows.write");
    const signIn = async (secondTime: boolean = false) => {
      try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        const credential = TwitterAuthProvider.credentialFromResult(result);
        const twitterAccessToken = credential?.accessToken;
        const twitterAccessSecret = credential?.secret;
        const twitterUserName = (
          user as any
        ).reloadUserInfo.providerUserInfo.filter(
          (info: any) => info.providerId === "twitter.com"
        )[0].screenName;
        const twitterUserId = (
          user as any
        ).reloadUserInfo.providerUserInfo.filter(
          (info: any) => info.providerId === "twitter.com"
        )[0].rawId;
        setTwitterUserName(twitterUserName);
        localStorage.setItem("twitterUserName", twitterUserName);
        setTwitterUserId(twitterUserId);
        localStorage.setItem("twitterUserId", twitterUserId);
        setTwitterIsLogin(true);

        const idToken = await user.getIdToken();

        localStorage.setItem("idToken", idToken);
        localStorage.setItem("uid", user.uid);

        if (twitterAccessToken && twitterAccessSecret) {
          const expirationDate = new Date();
          expirationDate.setTime(expirationDate.getTime() + 60 * 60 * 1000);
          const expires = `expires=${expirationDate.toUTCString()}`;
          document.cookie = `FIREBASE_ID_TOKEN=${idToken}; ${expires}; path=/;`;
          document.cookie = `uid=${user.uid}; ${expires}; path=/;`;
          document.cookie = `TWITTER_IS_LOGIN=true; ${expires}; path=/;`;
          await fetch("/api/auth/set-cookie", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify([
              {
                key: "TWITTER_ACCESS_TOKEN",
                value: twitterAccessToken,
              },
              {
                key: "TWITTER_ACCESS_SECRET",
                value: twitterAccessSecret,
              },
            ]),
          });
          setTwitterCookieIsReady(true);
          // Auto-register user in GiveRep - mark them as verified since Twitter auth is sufficient
          try {
            console.log(
              `Attempting to register/verify user ${twitterUserName} (ID: ${twitterUserId}) with GiveRep`
            );

            // First try to register the user normally
            const response = await fetch("/api/giverep/users", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                twitterHandle: twitterUserName,
                twitterId: twitterUserId, // Include Twitter ID for reliable user tracking
              }),
            });

            const userData = await response.json();
            console.log("User registration response:", userData);

            // Check if the user is already registered but not verified,
            // or if they're registered but the verification status is not explicitly true
            if (
              userData.is_verified === false ||
              userData.existingUnverified === true ||
              (userData.message && userData.message.includes("not verified"))
            ) {
              console.log(
                `User ${twitterUserName} exists but needs verification. Sending auto-verify request.`
              );

              // Explicitly verify the user with auto-verify endpoint
              const verifyResponse = await fetch(
                "/api/giverep/users/auto-verify",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    twitterHandle: twitterUserName,
                    twitterId: twitterUserId, // Include Twitter ID here too
                  }),
                }
              );

              const verifyData = await verifyResponse.json();
              console.log("Verification response:", verifyData);

              if (verifyData.is_verified) {
                console.log(
                  `Successfully auto-verified user ${twitterUserName} (ID: ${twitterUserId}) with GiveRep`
                );

                // Fetch and update Twitter profile data using FXTwitter API
                try {
                  console.log(
                    `Fetching profile data for ${twitterUserName} using FXTwitter API`
                  );

                  const profileResponse = await fetch(
                    "/api/auth/update-twitter-profile",
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        twitterHandle: twitterUserName,
                        twitterId: twitterUserId,
                      }),
                    }
                  );

                  const profileData = await profileResponse.json();

                  if (profileResponse.ok && profileData.success) {
                    console.log(
                      `Successfully updated profile data for ${twitterUserName}`,
                      profileData.user
                    );
                  } else {
                    console.warn(
                      `Profile data update for ${twitterUserName} returned unexpected result:`,
                      profileData
                    );
                  }
                } catch (profileError) {
                  console.error(
                    `Error updating profile data for ${twitterUserName}:`,
                    profileError
                  );
                  // Non-blocking error, continue with login process
                }

                // Explicitly trigger tweet collection for this newly verified user
                try {
                  const collectionResponse = await fetch(
                    "/api/giverep/tweets/collect-for-user",
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        twitterHandle: twitterUserName,
                      }),
                    }
                  );

                  const collectionData = await collectionResponse.json();
                  console.log(
                    `Tweet collection result for ${twitterUserName}:`,
                    collectionData
                  );
                } catch (collectionError) {
                  console.error(
                    `Error collecting tweets for ${twitterUserName}:`,
                    collectionError
                  );
                  // Non-blocking error, continue with login process
                }
              } else {
                console.error(
                  `Failed to auto-verify user ${twitterUserName}:`,
                  verifyData
                );
              }
            } else {
              console.log(
                `User ${twitterUserName} (ID: ${twitterUserId}) is already registered and verified with GiveRep`
              );

              // Even for existing users, update their Twitter profile data
              try {
                console.log(
                  `Updating profile data for existing user ${twitterUserName} using FXTwitter API`
                );

                const profileResponse = await fetch(
                  "/api/auth/update-twitter-profile",
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      twitterHandle: twitterUserName,
                      twitterId: twitterUserId,
                    }),
                  }
                );

                const profileData = await profileResponse.json();

                if (profileResponse.ok && profileData.success) {
                  console.log(
                    `Successfully updated profile data for existing user ${twitterUserName}`,
                    profileData.user
                  );
                } else {
                  console.warn(
                    `Profile data update for existing user ${twitterUserName} returned unexpected result:`,
                    profileData
                  );
                }
              } catch (profileError) {
                console.error(
                  `Error updating profile data for existing user ${twitterUserName}:`,
                  profileError
                );
                // Non-blocking error, continue with login process
              }

              // Skip tweet collection for existing users to save API credits
              console.log(
                `Skipping tweet collection for existing user ${twitterUserName} to save API credits`
              );
            }
          } catch (error) {
            console.error(
              "Error auto-registering/verifying user with GiveRep:",
              error
            );
          }

          setTwitterIsLogin(true);
        }
      } catch (error: any) {
        if (secondTime) {
          if (failFirstTimeAlready) {
            console.error("ERROR", error);
            toast.error(
              "X (Twitter) API is unstable right now, please try again later."
            );
            // toast.error("Failed to login with X (Twitter)");
            // toast.error(
            //   "This feature is not supported on some mobile browsers, please try use chrome or Safari on your mobile device."
            // );
            // // toast.error("Maybe the service rate limit is exceeded");
            // toast.error(JSON.stringify(error));
            // toast.error(
            //   "Share this screenshot with the team to help us fix this bug"
            // );
          } else {
            setFailFirstTimeAlready(true);
            toast.error(
              "X (Twitter) API is unstable right now, please try again later."
            );
            return;
            // toast.error("Please click the button again to login with X (Twitter)");
          }
        } else {
          setTimeout(() => {
            signIn(true);
          }, 100);
        }
      }
    };
    setTimeout(signIn, 100);
  };
  useEffect(() => {
    const getCookie = (name: string) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(";").shift();
      return null;
    };
    const isLogin = getCookie("TWITTER_IS_LOGIN") === "true";
    setTwitterIsLogin(isLogin);
    setTwitterCookieIsReady(isLogin);
    if (isLogin) {
      const storedUserName = localStorage.getItem("twitterUserName");
      if (storedUserName) {
        setTwitterUserName(storedUserName);
      }
      const storedUserId = localStorage.getItem("twitterUserId");
      if (storedUserId) {
        setTwitterUserId(storedUserId);
      }
    }
  }, []);
  const logoutTwitter = () => {
    document.cookie = `TWITTER_IS_LOGIN=false; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    setTwitterIsLogin(false);
    setTwitterUserName("");
    setTwitterUserId("");
  };

  // Function to sync the Twitter handle with the server session
  const syncTwitterSession = async (): Promise<boolean> => {
    try {
      // Don't sync if not logged in
      if (!twitterIsLogin || !twitterUserName) {
        console.log(
          "[TwitterAuth] Not syncing session: user not logged in or no Twitter handle"
        );
        return false;
      }

      console.log(
        `[TwitterAuth] Syncing Twitter session for handle: ${twitterUserName}`
      );

      const response = await fetch("/api/auth/sync-twitter-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          twitterHandle: twitterUserName,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        console.log("[TwitterAuth] Session sync successful:", data);
        return true;
      } else {
        console.error("[TwitterAuth] Session sync failed:", data);
        return false;
      }
    } catch (error) {
      console.error("[TwitterAuth] Error syncing Twitter session:", error);
      return false;
    }
  };
  return (
    <TwitterAuthContext.Provider
      value={{
        handleTwitterLogin,
        twitterIsLogin,
        twitterCookieIsReady,
        setTwitterIsLogin,
        logoutTwitter,
        twitterUserName,
        twitterUserId,
        syncTwitterSession,
      }}
    >
      {children}
    </TwitterAuthContext.Provider>
  );
};

export const useTwitterAuth = () => {
  const context = useContext(TwitterAuthContext);
  if (!context) {
    throw new Error(
      "useTwitterAuth must be used within a TwitterAuthProviderComponent"
    );
  }
  return context;
};
