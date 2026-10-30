import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { LOGIN_PATH } from "@/const";
import { AuthLayoutSkeleton } from "./AuthLayoutSkeleton";

export default function AuthLayout({ children }: { children: ReactNode }) {
  const { isLoading, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate(LOGIN_PATH, { replace: true, state: { from: location.pathname } });
    }
  }, [isLoading, user, navigate, location.pathname]);

  if (isLoading) return <AuthLayoutSkeleton />;
  if (!user) return null;
  return children;
}
