import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface TerminologyContextType {
  primaryRoleName: string;
  secondaryRoleName: string;
  updateTerminology: (primary: string, secondary: string) => Promise<void>;
}

const TerminologyContext = createContext<TerminologyContextType>({
  primaryRoleName: "Parent",
  secondaryRoleName: "Child",
  updateTerminology: async () => {},
});

export function TerminologyProvider({ children }: { children: React.ReactNode }) {
  const [primaryRoleName, setPrimary] = useState("Parent");
  const [secondaryRoleName, setSecondary] = useState("Child");

  useEffect(() => {
    api.getTerminology()
      .then(data => {
        if (data.primaryRoleName) setPrimary(data.primaryRoleName);
        if (data.secondaryRoleName) setSecondary(data.secondaryRoleName);
      })
      .catch(() => {});
  }, []);

  const updateTerminology = async (primary: string, secondary: string) => {
    // compact format "Primary:Secondary" fits within varchar(32) constraint
    const memberLabel = `${primary}:${secondary}`;
    await api.updateOrg({ member_label: memberLabel });
    setPrimary(primary);
    setSecondary(secondary);
  };

  return (
    <TerminologyContext.Provider value={{ primaryRoleName, secondaryRoleName, updateTerminology }}>
      {children}
    </TerminologyContext.Provider>
  );
}

export function useTerminology() {
  return useContext(TerminologyContext);
}
