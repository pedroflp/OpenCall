import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { ViewTransitions } from "next-view-transitions";
import { AuthProvider } from "../providers/AuthProvider";
import { VoiceProvider } from "../providers/VoiceProvider";
import { CallProvider } from "../providers/CallProvider";
import VoiceDock from "@/components/VoiceDock";
import PresenceHeartbeat from "@/components/PresenceHeartbeat";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import UpdateAvailableToast from "@/components/UpdateAvailableToast";
import "./globals.css";

const primaryFont = Bricolage_Grotesque({ subsets: ["latin"] });

// Ícones gerados a partir de public/logo.png, o ícone oficial do OpenCall
// (ver public/README.md). Numa instalação com marca própria, troque
// título/descrição/ícones aqui.
export const metadata: Metadata = {
  title: "OpenCall",
  description: "Voz, vídeo e chat de comunidade — self-hosted.",
  icons: {
    icon: "/icons/opencall-192.png",
    apple: "/icons/opencall-apple-touch.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OpenCall",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ViewTransitions>
      <html className="dark" style={{ colorScheme: "dark" }}>
        <body className={primaryFont.className}>
          <AuthProvider>
            <ServiceWorkerRegister />
            <UpdateAvailableToast />
            <TooltipProvider delayDuration={300}>
              <VoiceProvider>
                <CallProvider>
                  <PresenceHeartbeat />
                  {children}
                  <VoiceDock />
                </CallProvider>
              </VoiceProvider>
              <Toaster />
            </TooltipProvider>
          </AuthProvider>
        </body>
      </html>
    </ViewTransitions>
  );
}
