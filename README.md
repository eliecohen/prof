# Learning Agent - Prototype

Un agent d'apprentissage interactif qui challenge la curiosité et développe la pensée profonde.

## Philosophie

Plutôt que de "dumper" du savoir, cet agent:
- Pose des questions qui forcent à penser
- Détecte ton niveau et s'adapte
- Challenge sans être condescendant  
- Rend l'apprentissage actif, pas passif
- Marche pour tous les domaines (sciences, philo, tech, etc.)

## Installation

```bash
# Installer les dépendances
pip install -r requirements.txt

# Créer le fichier .env avec ta clé API
cp .env.example .env
# Puis éditer .env et ajouter: ANTHROPIC_API_KEY=ta_clé
```

## Utilisation

```bash
./run.sh
```

**Commandes:**
- `quit` - Quitter (sauvegarde automatique)
- `reset` - Recommencer la conversation
- `debug` - Voir l'état interne
- `Ctrl+C` - Quitter avec sauvegarde

**Fonctionnalités:**
- 🧠 **Mémoire persistante** - Se souvient entre les sessions
- 🔄 **Reprise de conversation** - "La dernière fois on parlait de..."
- ❓ **Questions non répondues** - Se souvient si tu as quitté en pleine discussion
- 💾 **Sauvegarde automatique** - Même avec Ctrl+C

## Architecture

```
agent.py         - Cerveau: prompt système + logique de réponse
conversation.py  - Gestion de l'historique du dialogue
memory.py        - Mémoire: profil apprenant + graphe de connaissances
main.py          - Interface CLI
```

## Mémoire persistante

Toutes les sessions sont sauvegardées dans `.memory/`:
- `profile.json` - Ton profil d'apprenant (style, préférences)
- `concepts.json` - Graphe de connaissances (ce que tu as exploré)
- `sessions.jsonl` - Historique de toutes les sessions

## Prochaines étapes

- [x] Mémoire persistante (entre sessions)
- [x] Reprise de conversation
- [ ] Interface voix (Deepgram + ElevenLabs)
- [ ] Visuel (arbre conceptuel + flowchart)
- [ ] Meilleure détection d'engagement
- [ ] LLM extrait automatiquement les concepts

## Exemple d'interaction

```
🧠 Agent: Salut! Qu'est-ce qui t'intéresse aujourd'hui?

👤 Toi: Les LLM

🧠 Agent: OK! Tu utilises ChatGPT ou Claude?

👤 Toi: Oui, j'ai même lu pas mal sur le sujet

🧠 Agent: Parfait, on saute les bases alors. 
         Dis-moi - qu'est-ce qui t'a le plus surpris?
```
