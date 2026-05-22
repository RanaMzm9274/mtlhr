import { createContext, useContext } from "react";

interface PortalSearchContextValue {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
}

const PortalSearchContext = createContext<PortalSearchContextValue | null>(null);

export const PortalSearchProvider = PortalSearchContext.Provider;

export const usePortalSearch = () => {
  const value = useContext(PortalSearchContext);
  if (!value) {
    return {
      searchTerm: "",
      setSearchTerm: () => undefined,
    };
  }
  return value;
};

