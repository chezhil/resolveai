// Server capabilities (/api/meta) shared with any component that needs them.

import { createContext, useContext } from "react";
import type { Meta } from "./api";

export const MetaContext = createContext<Meta | null>(null);

export const useMeta = () => useContext(MetaContext);

/** True when the server checks approver PINs (APPROVER_OPS_PIN / APPROVER_RISK_PIN are set). */
export const usePinRequired = () => !!useContext(MetaContext)?.approvals?.pinRequired;
