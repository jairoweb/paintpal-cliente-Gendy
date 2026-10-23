import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, X, Send, Loader2, Copy, Check, Sparkles, Mic, MicOff, ImagePlus, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import DOMPurify from "dompurify";

const AI_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pintor-ai`;

type Msg = { role: "user" | "assistant"; content: string; image?: string };

type ApiMsg = {
  role: "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

const toApiMessages = (msgs: Msg[]): ApiMsg[] =>
  msgs.map(m =>
    m.image
      ? {
          role: m.role,
          content: [
            { type: "text" as const, text: m.content || "Analiza esta foto como pintor profesional." },
            { type: "image_url" as const, image_url: { url: m.image } },
          ],
        }
      : { role: m.role, content: m.content },
  );


// Extend window type for cross-browser Speech Recognition
interface ISpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onstart: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onend: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: ISpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: ISpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
}
type SpeechRecognitionConstructor = new () => ISpeechRecognition;
declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor;
    webkitSpeechRecognition: SpeechRecognitionConstructor;
  }
}

const QUICK_PROMPTS = [
  { label: "📧 Email de presupuesto", prompt: "Escríbeme un email profesional para enviar a un cliente con el presupuesto de un trabajo de pintura interior de un piso de 80m²." },
  { label: "💶 Solicitar cobro", prompt: "Redacta un email amable pero firme para pedirle a un cliente que lleva 2 semanas sin pagar el trabajo terminado." },
  { label: "📋 Confirmar cita", prompt: "Escribe un mensaje corto para confirmarle a un cliente la cita de presupuesto para mañana a las 10h." },
  { label: "🔨 Inicio de obra", prompt: "Redacta un mensaje para avisarle a un cliente que empezamos su obra mañana a las 8h de la mañana." },
  { label: "✅ Fin de trabajo", prompt: "Escribe un mensaje profesional para comunicarle a un cliente que hemos terminado el trabajo y puede venir a verlo." },
  { label: "💡 Consejo precio", prompt: "¿Cómo calculo bien el precio de pintar un piso completo de 100m²? ¿Qué debo incluir?" },
];

const INITIAL_MESSAGE: Msg = {
  role: "assistant",
  content: "¡Hola! Soy **Jairo**, tu asistente de IA 🎨\n\nPuedo ayudarte a **redactar emails para clientes**, escribir **presupuestos**, dar **consejos de precios** y mucho más.\n\nUsa los accesos rápidos, escríbeme o **háblame con el micrófono** 🎙️",
};

const getChatStorageKey = (userId: string) => `jairo-ai-chat:${userId}`;
const getDraftStorageKey = (userId: string) => `jairo-ai-draft:${userId}`;

async function streamChat(messages: Msg[], onDelta: (t: string) => void, onDone: () => void) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;

  const resp = await fetch(AI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages: toApiMessages(messages) }),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.error || "Error al conectar con la IA");
  }

  if (!resp.body) throw new Error("Sin respuesta del servidor");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;

  while (!done) {
    const { done: rdone, value } = await reader.read();
    if (rdone) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") { done = true; break; }
      try {
        const parsed = JSON.parse(json);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) onDelta(content);
      } catch {
        buffer = line + "\n" + buffer;
        break;
      }
    }
  }

  onDone();
}

function getBudgetText(content: string) {
  const lines = content.replace(/\r/g, "").split("\n");
  const normalizedLine = (line: string) => line
    .replace(/[\*#_`]/g, "")
    .replace(/^\s*[-•]+\s*/, "")
    .trim();
  const isBudgetHeading = (line: string) => /^(presupuesto|propuesta)\b/i.test(normalizedLine(line));
  const isExtraSection = (line: string) => /^(notas?|consejo|recomendaciones?|observaciones?|instrucciones)\b/i.test(normalizedLine(line));

  // Descarta la introducción de Jairo y cualquier bloque posterior de notas o instrucciones.
  const start = lines.findIndex(isBudgetHeading);
  const budgetLines = start >= 0 ? lines.slice(start) : lines;
  const end = budgetLines.findIndex((line, index) => index > 0 && isExtraSection(line));
  const budget = (end >= 0 ? budgetLines.slice(0, end) : budgetLines).join("\n");

  return budget
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")
    // Las partidas del presupuesto no necesitan mostrar la tabla técnica
    // cuando los valores son cero: cantidad, unidad, precio e importe.
    .replace(/^\s*Cantidad\s*:\s*[^\n]*\bUnidad\s*:\s*[^\n]*\bPrecio\s*:\s*0(?:[,.]0+)?\s*$/gim, "")
    .replace(/^\s*Import(?:e|ación)\s*:\s*0(?:[,.]0+)?\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getDisplayedContent(content: string) {
  const looksLikeBudget = /\b(presupuesto|propuesta)\b/i.test(content) ||
    /\bCantidad\s*:/i.test(content);
  return looksLikeBudget ? getBudgetText(content) : content;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(getBudgetText(text));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1.5 opacity-70 hover:opacity-100 transition-opacity"
    >
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
      {copied ? "¡Copiado!" : "Copiar presupuesto"}
    </button>
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function openBudgetPdf(content: string) {
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) return false;

  const body = getBudgetText(content)
    .split("\n")
    .map((line) => `<p>${escapeHtml(line) || "&nbsp;"}</p>`)
    .join("");

  printWindow.document.write(`<!doctype html>
    <html lang="es"><head><meta charset="utf-8" />
    <title>Presupuesto - Jairo</title>
    <style>
      body { font-family: Arial, sans-serif; color: #172033; max-width: 800px; margin: 0 auto; padding: 48px; line-height: 1.5; }
      h1 { color: #214d80; margin-bottom: 28px; }
      p { margin: 0 0 8px; white-space: pre-wrap; }
      .footer { margin-top: 36px; color: #667085; font-size: 12px; border-top: 1px solid #ddd; padding-top: 12px; }
      @media print { body { padding: 0; } }
    </style></head><body>
    <h1>Presupuesto</h1>${body}
    <div class="footer">Generado por Jairo · ${new Date().toLocaleDateString("es-ES")}</div>
    </body></html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.onload = () => printWindow.print();
  return true;
}

export default function AIAssistant() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const hydratedChatRef = useRef(false);

  // Recover the latest chat and unsent draft after a refresh or route change.
  useEffect(() => {
    if (!user?.id) return;

    try {
      const savedMessages = localStorage.getItem(getChatStorageKey(user.id));
      const savedDraft = localStorage.getItem(getDraftStorageKey(user.id));
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages) as Msg[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Actualiza también respuestas antiguas guardadas antes del cambio de nombre.
          const migrated = parsed.map((message) =>
            message.role === "assistant"
              ? { ...message, content: message.content.replace(/Pablo/g, "Jairo") }
              : message,
          );
          setMessages(migrated);
        }
      }
      if (savedDraft) setInput(savedDraft);
    } catch (error) {
      console.warn("No se pudo recuperar la memoria local del chat:", error);
    } finally {
      hydratedChatRef.current = true;
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !hydratedChatRef.current) return;
    try {
      // Images are intentionally excluded from local persistence to avoid filling browser storage.
      const messagesWithoutImages = messages.map(({ image: _image, ...message }) => message);
      localStorage.setItem(getChatStorageKey(user.id), JSON.stringify(messagesWithoutImages));
    } catch (error) {
      console.warn("No se pudo guardar la memoria local del chat:", error);
    }
  }, [messages, user?.id]);

  useEffect(() => {
    if (!user?.id || !hydratedChatRef.current) return;
    try {
      if (input) localStorage.setItem(getDraftStorageKey(user.id), input);
      else localStorage.removeItem(getDraftStorageKey(user.id));
    } catch (error) {
      console.warn("No se pudo guardar el borrador del chat:", error);
    }
  }, [input, user?.id]);

  // Check browser support for speech recognition
  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    setMicSupported(!!SpeechRecognitionAPI);
  }, []);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      toast({ title: "No compatible", description: "Tu navegador no soporta reconocimiento de voz.", variant: "destructive" });
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "es-ES";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => setListening(true);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      // Auto-focus textarea after speaking
      setTimeout(() => textareaRef.current?.focus(), 100);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setListening(false);
      recognitionRef.current = null;
      if (event.error !== "aborted") {
        toast({ title: "Error de micrófono", description: "No se pudo acceder al micrófono.", variant: "destructive" });
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [toast]);

  const toggleMic = useCallback(() => {
    if (listening) {
      stopListening();
    } else {
      startListening();
    }
  }, [listening, startListening, stopListening]);

  const sendMessage = async (text: string, image?: string) => {
    const attached = image ?? pendingImage;
    if ((!text.trim() && !attached) || loading) return;
    if (listening) stopListening();
    const userMsg: Msg = { role: "user", content: text.trim(), image: attached || undefined };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setPendingImage(null);
    setLoading(true);

    let accumulated = "";
    try {
      await streamChat(
        newMessages,
        (chunk) => {
          accumulated += chunk;
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: accumulated } : m);
            }
            return [...prev, { role: "assistant", content: accumulated }];
          });
        },
        () => setLoading(false)
      );
    } catch (err: unknown) {
      console.error("Error de IA:", err);
      setLoading(false);
      toast({ title: "Error de IA", description: "No se pudo obtener respuesta. Inténtalo de nuevo.", variant: "destructive" });
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Archivo no válido", description: "Selecciona una foto.", variant: "destructive" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "Foto demasiado grande", description: "Usa una foto de menos de 8 MB.", variant: "destructive" });
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("read_error"));
        reader.readAsDataURL(file);
      });
      setPendingImage(dataUrl);
    } catch (err) {
      console.error("Error leyendo la imagen:", err);
      toast({ title: "No se pudo cargar la foto", description: "Inténtalo de nuevo.", variant: "destructive" });
    }
  };


  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Simple markdown-like rendering
  const renderContent = (content: string) => {
    const lines = content.split("\n");
    return lines.map((line, i) => {
      const formatted = line
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(/`(.*?)`/g, "<code class='bg-muted px-1 rounded text-xs font-mono'>$1</code>");
      const sanitized = DOMPurify.sanitize(formatted, { ALLOWED_TAGS: ['strong', 'em', 'code'], ALLOWED_ATTR: ['class'] });
      return (
        <span key={i}>
          <span dangerouslySetInnerHTML={{ __html: sanitized }} />
          {i < lines.length - 1 && <br />}
        </span>
      );
    });
  };

  return (
    <>
      {/* Floating Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-elevated flex items-center justify-center transition-transform hover:scale-110 gradient-accent"
          title="Abrir asistente IA"
        >
          <Sparkles className="w-6 h-6 text-white" />
        </button>
      )}

      {/* Chat Panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-24px)] flex flex-col rounded-2xl shadow-elevated overflow-hidden bg-card border border-border"
          style={{ height: "560px", maxHeight: "calc(100vh - 80px)" }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 gradient-primary flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full gradient-accent flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-primary-foreground font-semibold text-sm leading-none">Jairo</p>
                <p className="text-primary-foreground/60 text-xs mt-0.5">Tu asistente personal</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-primary-foreground/60 hover:text-primary-foreground transition-colors p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 px-4 py-3">
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "gradient-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  )}>
                    {msg.image && (
                      <img
                        src={msg.image}
                        alt="Foto enviada al asistente"
                        loading="lazy"
                        className="mb-2 rounded-lg w-full max-w-[220px] aspect-[4/3] object-cover border border-white/20"
                      />
                    )}
                    {renderContent(getDisplayedContent(msg.content))}

                    {msg.role === "assistant" && msg.content.length > 50 && (
                      <div className="flex items-center gap-3">
                        <CopyButton text={msg.content} />
                        <button
                          onClick={() => {
                            if (!openBudgetPdf(msg.content)) {
                              toast({ title: "No se pudo abrir el PDF", description: "Permite las ventanas emergentes e inténtalo de nuevo.", variant: "destructive" });
                            }
                          }}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1.5 opacity-70 hover:opacity-100 transition-opacity"
                          title="Abrir para guardar como PDF"
                        >
                          <Download className="w-3 h-3" />
                          Guardar PDF
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Jairo está escribiendo...</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          {/* Quick prompts */}
          <div className="px-3 py-2 flex gap-1.5 overflow-x-auto scrollbar-hide flex-shrink-0 border-t border-border">
            {QUICK_PROMPTS.map(({ label, prompt }) => (
              <button
                key={label}
                onClick={() => sendMessage(prompt)}
                disabled={loading}
                className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>

          {/* Vista previa de la foto adjunta */}
          {pendingImage && (
            <div className="px-3 pt-2 flex items-center gap-2.5 flex-shrink-0">
              <div className="relative">
                <img
                  src={pendingImage}
                  alt="Foto lista para enviar"
                  className="h-14 w-14 rounded-lg object-cover border border-border"
                />
                <button
                  onClick={() => setPendingImage(null)}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center transition-transform hover:scale-110"
                  title="Quitar foto"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Foto lista. Escribe tu pregunta o envía directamente.</p>
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-border flex gap-2 items-end flex-shrink-0">
            <div className="relative flex-1">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={listening ? "🎙️ Escuchando... habla ahora" : "Escríbeme, habla o envía una foto..."}
                className={cn(
                  "resize-none min-h-[40px] max-h-[100px] text-sm pr-2 transition-all",
                  listening && "border-destructive ring-1 ring-destructive/50 bg-destructive/5"
                )}
                rows={1}
              />
              {listening && (
                <span className="absolute right-2 top-2 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
                </span>
              )}
            </div>

            {/* Foto */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelect}
            />
            <Button
              size="icon"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="flex-shrink-0 h-10 w-10"
              title="Enviar una foto"
            >
              <ImagePlus className="w-4 h-4" />
            </Button>

            {/* Mic button */}
            {micSupported && (
              <Button
                size="icon"
                variant={listening ? "destructive" : "outline"}
                onClick={toggleMic}
                disabled={loading}
                className="flex-shrink-0 h-10 w-10"
                title={listening ? "Parar micrófono" : "Hablar"}
              >
                {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </Button>
            )}

            {/* Send button */}
            <Button
              size="icon"
              onClick={() => sendMessage(input)}
              disabled={loading || (!input.trim() && !pendingImage)}
              className="flex-shrink-0 h-10 w-10"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>

        </div>
      )}
    </>
  );
}
