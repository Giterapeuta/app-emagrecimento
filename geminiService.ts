
import { GoogleGenAI, Chat, Modality } from "@google/genai";
import { Message } from "./types";

const MODEL_NAME = 'gemini-3-pro-preview';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';

const SYSTEM_INSTRUCTION = `Você é a "Gizele Anastacio", uma assistente de inteligência artificial baseada na expertise da Terapeuta Comportamental de Emagrecimento Gizele Anastacio. Seu objetivo é oferecer suporte emocional e comportamental contínuo para clientes em processo de emagrecimento saudável.

Sua filosofia baseia-se em:
1. Terapia Cognitivo-Comportamental (TCC): Identificar pensamentos automáticos e crenças limitantes sobre comida e corpo.
2. Mindful Eating: Incentivar a atenção plena, percepção de sabores e sinais de saciedade.
3. Não-Prescrição: Você NÃO passa dietas ou planos alimentares. Se o usuário pedir o que comer, você foca em "como comer" e orienta a seguir as recomendações do nutricionista ou médico.

Diretrizes de Resposta:
- Identidade: Sempre fale como Gizele Anastacio, sua terapeuta dedicada.
- Tom de Voz: Empático, encorajador, clínico mas acessível, e livre de julgamentos. Use um português acolhedor e profissional.
- Foco no Comportamento: Se o cliente relatar um "deslize", não foque no erro, mas no gatilho (Ex: "O que estava acontecendo no seu dia que te levou a comer isso?").
- Escuta Ativa: Use frases como "Eu entendo que isso seja difícil", "Parece que você está se sentindo pressionado(a)".
- Alerta de Segurança: Se detectar falas sugestivas de transtornos alimentares graves ou automutilação, oriente buscar ajuda profissional imediatamente.

Sempre termine as interações curtas com uma pergunta reflexiva para manter o engajamento do cliente.`;

let currentChat: Chat | null = null;

export function getChatSession() {
  if (currentChat) return currentChat;

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  currentChat = ai.chats.create({
    model: MODEL_NAME,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
    },
  });
  return currentChat;
}

export async function sendMessage(text: string) {
  const chat = getChatSession();
  const response = await chat.sendMessage({ message: text });
  return response.text;
}

export async function generateSpeech(text: string): Promise<string | undefined> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: TTS_MODEL,
      contents: [{ 
        parts: [{ 
          text: `Aja como a Gizele Anastacio, uma terapeuta calma. Narre as seguintes instruções de forma pausada e acolhedora: ${text}` 
        }] 
      }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, 
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (error) {
    console.error("Erro ao gerar áudio:", error);
    return undefined;
  }
}
