import { USE_SUPABASE } from "../../../lib/backend";
import { useMemberPortalDataFirebase } from "./useMemberPortalData.firebase";
import { useMemberPortalDataSupabase } from "./useMemberPortalData.supabase";

/**
 * Member-portal data contract, identical for both backends:
 * { employee, employeeLoaded, bookings, benefits, events, requests, submitRequest, cancelRequest }
 * The backend is fixed at build time, so the chosen hook never changes between renders.
 */
export const useMemberPortalData = USE_SUPABASE ? useMemberPortalDataSupabase : useMemberPortalDataFirebase;
