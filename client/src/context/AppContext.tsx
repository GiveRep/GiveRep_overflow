import { createContext, useState, ReactNode } from "react";

interface AppContextType {
  isWalletOpen: boolean;
  setWalletOpen: (isOpen: boolean) => void;
}

const defaultAppContext: AppContextType = {
  isWalletOpen: false,
  setWalletOpen: () => {},
};

export const AppContext = createContext<AppContextType>(defaultAppContext);

interface AppContextProviderProps {
  children: ReactNode;
}

export const AppContextProvider = ({ children }: AppContextProviderProps) => {
  const [isWalletOpen, setWalletOpen] = useState<boolean>(false);

  const value = {
    isWalletOpen,
    setWalletOpen,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
