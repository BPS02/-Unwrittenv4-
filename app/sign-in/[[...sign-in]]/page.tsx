import { SignIn } from "@clerk/nextjs";
import AuthPageShell from "@/components/AuthPageShell";
import { clerkEnabled } from "@/lib/clerk-config";
import { clerkAppearance } from "@/lib/clerk-appearance";

export default function SignInPage() {
  return (
    <AuthPageShell kind="sign-in" enabled={clerkEnabled}>
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/create"
        appearance={clerkAppearance}
      />
    </AuthPageShell>
  );
}
