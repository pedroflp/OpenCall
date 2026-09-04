import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
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

// Ícones gerados a partir de public/opencall-logo.png, o ícone oficial do
// OpenCall (ver public/README.md). Numa instalação com marca própria, troque
// título/descrição/ícones aqui.
//
// `generateMetadata` em vez de um objeto solto porque a descrição é traduzida —
// o nome "OpenCall" não é, que é marca.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");

  return {
    title: "OpenCall",
    description: t("description"),
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
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Idioma e catálogo vêm do cookie (ver src/i18n/request.ts). O provider fica
  // por FORA de tudo: VoiceProvider, Toaster e o dock também traduzem, e um
  // provider aninhado mais fundo deixaria justamente essas partes de fora.
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <ViewTransitions>
      <html lang={locale} className="dark" style={{ colorScheme: "dark" }}>
        <body className={primaryFont.className}>
          <NextIntlClientProvider locale={locale} messages={messages}>
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
          </NextIntlClientProvider>
        </body>
      </html>
    </ViewTransitions>
  );
}
