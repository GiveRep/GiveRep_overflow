// src/contexts/Authentication.tsx
import { useCallback, useContext, useEffect, useState } from "react";
import { createContext } from "react";
import { useCustomWallet } from "@/contexts/CustomWallet";

const isFollowingUserPropsSchema = (obj: any): obj is UserProps => {
  return (
    typeof obj.firstName === "string" &&
    typeof obj.lastName === "string" &&
    typeof obj.email === "string" &&
    typeof obj.picture === "string"
  );
};
export interface UserProps {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  picture: string;
}
export interface AuthenticationContextProps {
  user: UserProps;
  isLoading: boolean;
  setIsLoading: (isLoading: boolean) => void;
  handleLoginAs: (user: UserProps) => void;
  handleLogout: () => void;
}

export const anonymousUser: UserProps = {
  firstName: "",
  lastName: "",
  role: "anonymous",
  email: "",
  picture: "",
};

export const useAuthentication = () => {
  const context = useContext(AuthenticationContext);
  return context;
};

export const AuthenticationContext = createContext<AuthenticationContextProps>({
  user: anonymousUser,
  isLoading: false,
  setIsLoading: () => {},
  handleLoginAs: () => {},
  handleLogout: () => {},
});

export const AuthenticationProvider = ({
  children,
}: {
  children: React.ReactNode | React.ReactNode[];
}) => {
  const [user, setUser] = useState<UserProps>(anonymousUser);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { address } = useCustomWallet();

  const handleLoginAs = useCallback((newUser: UserProps) => {
    setUser(newUser);
    localStorage.setItem("user", JSON.stringify(newUser));
  }, []);

  useEffect(() => {
    const initialUser = localStorage.getItem("user");
    if (initialUser && address) {
      const parsedUser = JSON.parse(initialUser);
      if (!isFollowingUserPropsSchema(parsedUser)) {
        setUser(anonymousUser);
        localStorage.removeItem("user");
      } else {
        handleLoginAs(parsedUser);
      }
    } else {
      setUser(anonymousUser);
    }
    setIsLoading(false);
  }, []);

  const handleLogout = async () => {
    try {
      // CSRF protection has been removed
      // Call server-side logout endpoint to invalidate session
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.error('Server logout failed:', await response.text());
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local state regardless of server response
      setUser(anonymousUser);
      localStorage.removeItem("user");
      window.location.href = "/";
    }
  };

  return (
    <AuthenticationContext.Provider
      value={{
        user,
        isLoading,
        setIsLoading,
        handleLoginAs,
        handleLogout,
      }}
    >
      {children}
    </AuthenticationContext.Provider>
  );
};
