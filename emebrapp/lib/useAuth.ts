"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./supabase";
import type { User } from "@supabase/supabase-js";

interface Profile {
  id: string;
  name: string | null;
  role: string | null;
  notes: string | null;
}

export function useAuth() {
  const router = useRouter();
  const [user, setUser]       = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("patient_profile")
      .select("id, name, role, notes")
      .eq("user_id", userId)
      .limit(1)
      .single();
    setProfile(data ?? null);
    setLoading(false);
  };

  const role: "caregiver" | "patient" | null =
    (profile?.role as "caregiver" | "patient") ?? null;

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/auth");
  };

  return { user, profile, role, loading, signOut };
}
