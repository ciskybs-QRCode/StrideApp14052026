import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAppData } from "./AppDataContext";

// ── Storage keys ──────────────────────────────────────────────────────────────

const DOCS_LAST_READ_KEY     = "stride_docs_last_read";
const INVOICES_UNREAD_KEY    = "stride_invoices_unread";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UnreadContextValue {
  hasUnreadDocs: boolean;
  hasUnreadInvoices: boolean;
  markDocsRead: () => Promise<void>;
  markInvoicesRead: () => Promise<void>;
  notifyNewInvoice: () => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const UnreadContext = createContext<UnreadContextValue>({
  hasUnreadDocs: false,
  hasUnreadInvoices: false,
  markDocsRead: async () => {},
  markInvoicesRead: async () => {},
  notifyNewInvoice: async () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const { documents } = useAppData();

  const [docsLastReadAt, setDocsLastReadAt] = useState<string | null>(null);
  const [hasUnreadInvoices, setHasUnreadInvoices]   = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Hydrate from AsyncStorage once on mount
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(DOCS_LAST_READ_KEY),
      AsyncStorage.getItem(INVOICES_UNREAD_KEY),
    ])
      .then(([docsTs, invoicesFlag]) => {
        setDocsLastReadAt(docsTs);
        setHasUnreadInvoices(invoicesFlag === "true");
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  // Derive document-unread state from the AppData documents array:
  // any document whose createdAt is newer than the stored last-read timestamp
  // is considered "unread". If the timestamp has never been saved, all docs count.
  const hasUnreadDocs =
    loaded &&
    documents.some(d => {
      if (!d.createdAt) return false;
      if (!docsLastReadAt) return true;
      return new Date(d.createdAt) > new Date(docsLastReadAt);
    });

  // ── Actions ────────────────────────────────────────────────────────────────

  const markDocsRead = useCallback(async () => {
    const now = new Date().toISOString();
    setDocsLastReadAt(now);
    try { await AsyncStorage.setItem(DOCS_LAST_READ_KEY, now); } catch { /* ignore */ }
  }, []);

  const markInvoicesRead = useCallback(async () => {
    setHasUnreadInvoices(false);
    try { await AsyncStorage.removeItem(INVOICES_UNREAD_KEY); } catch { /* ignore */ }
  }, []);

  /** Call this whenever a new invoice arrives (e.g. from realtime event). */
  const notifyNewInvoice = useCallback(async () => {
    setHasUnreadInvoices(true);
    try { await AsyncStorage.setItem(INVOICES_UNREAD_KEY, "true"); } catch { /* ignore */ }
  }, []);

  return (
    <UnreadContext.Provider
      value={{ hasUnreadDocs, hasUnreadInvoices, markDocsRead, markInvoicesRead, notifyNewInvoice }}
    >
      {children}
    </UnreadContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useUnread() {
  return useContext(UnreadContext);
}
