import evilSystemPrompt from './evil'
import midijourneyPrompt from './midijourney'
import rtistPrompt from './rtist'
import surSystemPrompt from './sur'
import unityPrompt from './unity'

export interface PersonaTemplate {
    name: string;
    prompt: string;
    defaultModel?: string;
}

export const personaTemplates: PersonaTemplate[] = [
    {
        name: 'evil',
        prompt: evilSystemPrompt,
        defaultModel: 'gpt-4'
    },
    {
        name: 'midijourney',
        prompt: midijourneyPrompt,
        defaultModel: 'gpt-4'
    },
    {
        name: 'rtist',
        prompt: rtistPrompt,
        defaultModel: 'gpt-4'
    },
    {
        name: 'sur',
        prompt: surSystemPrompt,
        defaultModel: 'gpt-4'
    },
    {
        name: 'unity',
        prompt: unityPrompt,
        defaultModel: 'gpt-4'
    }
]

export function getPersonaTemplate(name: string): PersonaTemplate | undefined {
    return personaTemplates.find(template => template.name.toLowerCase() === name.toLowerCase())
}

export function applyPersonaToMessages(persona: PersonaTemplate, messages: Conversation): Conversation {
    return [
        { role: 'system', content: persona.prompt },
        ...messages
    ]
}
