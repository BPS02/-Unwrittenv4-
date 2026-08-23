import { SignUp } from "@clerk/nextjs";
import AuthPageShell from "@/components/AuthPageShell";
import { clerkEnabled } from "@/lib/clerk-config";
import { clerkAppearance } from "@/lib/clerk-appearance";

export default function SignUpPage() {
  return (
    <AuthPageShell kind="sign-up" enabled={clerkEnabled}>
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/create"
        appearance={clerkAppearance}
      />
    </AuthPageShell>
  );
}
