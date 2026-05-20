import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/useSession";

export function LoginPage() {
  const {
    bootstrap,
    isAuthenticating,
    login,
    setupStatus,
    errorMessage,
  } = useSession();
  const bootstrapRequired = setupStatus?.bootstrapRequired ?? false;
  const bootstrapSecretRequired = setupStatus?.bootstrapSecretRequired ?? false;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bootstrapSecret, setBootstrapSecret] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (bootstrapRequired) {
      await bootstrap({
        companyName: companyName.trim(),
        displayName: displayName.trim(),
        email: email.trim(),
        password,
        ...(bootstrapSecret ? { bootstrapSecret } : {}),
      });
    } else {
      await login({ email: email.trim(), password });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-accent/40 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-lg font-semibold">
            FE
          </div>
          <CardTitle className="text-2xl">
            {bootstrapRequired ? "Create your workspace" : "Sign in"}
          </CardTitle>
          <CardDescription>
            {bootstrapRequired
              ? "Set up the first administrator account for your company."
              : "Welcome back. Sign in to continue to Fence Estimator."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {bootstrapRequired ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="companyName">Company name</Label>
                  <Input
                    id="companyName"
                    autoComplete="organization"
                    required
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="displayName">Your name</Label>
                  <Input
                    id="displayName"
                    autoComplete="name"
                    required
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                </div>
              </>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={bootstrapRequired ? "new-password" : "current-password"}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {bootstrapRequired && bootstrapSecretRequired ? (
              <div className="space-y-1.5">
                <Label htmlFor="bootstrapSecret">Bootstrap secret</Label>
                <Input
                  id="bootstrapSecret"
                  type="password"
                  required
                  value={bootstrapSecret}
                  onChange={(event) => setBootstrapSecret(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Provided to your operator; required only for the first account.
                </p>
              </div>
            ) : null}
            {errorMessage ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errorMessage}
              </div>
            ) : null}
            <Button type="submit" className="w-full" size="lg" disabled={isAuthenticating}>
              {isAuthenticating ? (
                <>
                  <Loader2 className="animate-spin" />
                  Working...
                </>
              ) : bootstrapRequired ? (
                "Create workspace"
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
