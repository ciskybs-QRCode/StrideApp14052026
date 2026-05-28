import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface TerminologyContextType {
  primaryRoleName: string;
  secondaryRoleName: string;
  updateTerminology: (primary: string, secondary: string) => Promise<void>;
}

const TerminologyContext = createContext<TerminologyContextType>({
  primaryRoleName: "Member",
  secondaryRoleName: "Dependent Member",
  updateTerminology: async () => {},
});

export function TerminologyProvider({ children }: { children: React.ReactNode }) {
  const [primaryRoleName, setPrimary] = useState("Member");
  const [secondaryRoleName, setSecondary] = useState("Dependent Member");

  // Legacy values stored in some DBs before the rename — always upgrade them
  const LEGACY_PRIMARY = new Set(["Parent", "parent"]);
  const LEGACY_SECONDARY = new Set(["Child", "child"]);

  useEffect(() => {
    api.getTerminology()
      .then(data => {
        const p = data.primaryRoleName;
        const s = data.secondaryRoleName;
        if (p && !LEGACY_PRIMARY.has(p)) setPrimary(p);
        if (s && !LEGACY_SECONDARY.has(s)) setSecondary(s);
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
