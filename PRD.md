# PRD — Gestionnaire personnel de tâches et projets

**Statut :** V1 fonctionnelle définie  
**Audience :** produit / design / implémentation  
**Positionnement :** outil personnel, mono-utilisateur, online-first  

---

## 1. Résumé produit

L’application est un gestionnaire personnel de tâches et de projets conçu pour capturer rapidement n’importe quelle intention, la clarifier progressivement, l’organiser seulement lorsque cela apporte de la valeur, puis faire émerger ce qui demande une action.

La boucle produit de référence est :

> **Capture → Classification automatique → Revue facultative → Organisation → Exécution → Accomplissement**

Le produit doit rester volontairement plus léger qu’un Jira, Notion ou gestionnaire de workflow complet. Il privilégie la vitesse, la faible friction, un modèle mental réduit et une interface minimaliste orientée développeur.

Le cœur différenciant est le **Collector** : l’utilisateur peut sortir immédiatement une idée de sa tête sans devoir décider à l’avance de sa catégorie, de son projet, de sa date ou de sa priorité.

---

## 2. Problème à résoudre

Dans un usage personnel, les outils de gestion de projet professionnels introduisent trop de structure et de collaboration, tandis que les applications de notes ne font pas suffisamment émerger les actions à exécuter.

Le produit doit permettre de :

- capturer une idée ou une action en quelques secondes ;
- classifier par défaut les captures en Task ou Project dès leur arrivée ;
- revoir et corriger les classifications automatiques sans imposer une validation avant usage ;
- conserver les captures non classifiées dans une section « Non classées » de Revue ;
- gérer des tâches ponctuelles et des tâches récurrentes simples ;
- structurer un projet avec des Tasks et des Checkpoints ;
- voir immédiatement ce qui demande de l’attention aujourd’hui ;
- conserver l’historique des projets et tâches terminés ou annulés ;
- retrouver rapidement n’importe quel objet ;
- utiliser le même espace depuis téléphone et ordinateur.

---

## 3. Principes produit

### 3.1 Capture avant structure

Aucune information autre que le contenu de la capture ne doit être obligatoire dans le Collector.

Jev propose par défaut une classification après la persistance de la capture. En cas d’échec, l’utilisateur peut choisir explicitement Task ou Project dans la Revue.

### 3.2 Classification immédiate, spécification progressive

Une capture est utilisable dès que Jev l’a classifiée, sans attendre la revue humaine.

Un objet classifié peut rester incomplet et être enrichi plus tard. Une Task ou un Project ne doit pas exiger de description, date ou rattachement pour exister.

La **classification** et la **spécification** sont deux décisions indépendantes. Un rattachement Project proposé par Jev reste optionnel et corrigeable.

### 3.3 La structure aide, elle ne bloque pas

Les relations ne servent jamais à autoriser l’existence d’un objet, sauf pour un Checkpoint qui appartient obligatoirement à un Project.

### 3.4 Pas de propagation silencieuse

Le changement de statut d’un conteneur ne modifie jamais automatiquement le statut des objets qu’il contient.

Exemples :

- mettre un Project en pause ne modifie pas ses Tasks ;
- supprimer un Checkpoint ne supprime aucune Task.

### 3.5 Les états calculés ne sont pas des statuts métier

Les notions comme `LATE`, `OVERDUE` ou `TO_BUILD` sont calculées par l’interface à partir des données existantes. Elles ne sont pas stockées comme statuts supplémentaires.

### 3.6 Créer vite, enrichir ensuite

La création doit être rapide et contextuelle. L’édition sert à enrichir les objets.

### 3.7 Pas de précision artificielle

La V1 n’affiche aucun pourcentage global de progression d’un projet. Elle expose seulement des faits : Tasks terminées, Checkpoints atteints, dates et statuts.

---

## 4. Scope V1

La V1 inclut :

- authentification d’un unique propriétaire ;
- Collector global ;
- classification automatique Jev depuis le Collector et revue des résultats ;
- section « Non classées » de Revue pour les captures non classifiées ;
- Tasks ;
- Projects ;
- Checkpoints ;
- tâches récurrentes simples ;
- Home avec `Late`, `In Progress` et `Today` ;
- recherche globale ;
- création contextuelle ;
- descriptions Markdown ;
- autosave ;
- Trash récupérable ;
- Undo léger sur actions rapides ;
- interface responsive mobile/desktop ;
- usage keyboard-first sur desktop ;
- usage tactile complet sur mobile.

---

## 5. Hors scope V1

Sont explicitement exclus :

- collaboration ;
- équipes, rôles, permissions ou workspaces ;
- inscription publique ;
- partage public ou partage par lien ;
- mode offline ;
- synchronisation différée ;
- notifications et rappels push/email ;
- entité `Goal` / `Objectif` ;
- entité `Routine` / `Habit` ;
- statut générique `DRAFT` / `INCOMPLETE` pour les objets classifiés ;
- sous-tâches ;
- modèle de checklist structuré ;
- tags ;
- priorités ;
- dépendances entre Tasks ;
- statuts supplémentaires de Task tels que `BLOCKED`, `ON_HOLD`, `BACKLOG` ou `REVIEW` ;
- pièces jointes et uploads ;
- moteur de workflow ;
- conversion générale d’un type d’objet en un autre hors correction d’une classification Jev ;
- historique détaillé des transitions ;
- historique d’occurrences des tâches récurrentes ;
- moteur avancé de récurrence ;
- quotas du type `3 fois par semaine` ;
- système `Skip once` pour une récurrence ;
- vues sauvegardées ;
- query language ;
- moteur de recherche avancé ;
- page Overview/dashboard dédiée ;
- pourcentage global de progression ;
- éditeur rich-text propriétaire ;
- analytics de productivité ;
- import automatique de captures depuis une source externe au Collector ;
- intégrations externes autres que Jev via OpenRouter.

---

## 6. Modèle conceptuel

```text
Project
  ├── 0..n Checkpoints
  └── 0..n Tasks

Task
  └── peut aussi être autonome

Checkpoint
  └── appartient obligatoirement à exactement 1 Project
```

Relations interdites en V1 :

```text
Checkpoint sans Project     ❌
Task → plusieurs Projects   ❌
Task → plusieurs Checkpoints❌
```

---

## 7. Entités métier

### 7.1 Entry

Une `Entry` est la trace persistante d’un texte saisi dans le Collector, qu’il soit classifié par Jev ou manuellement. Elle conserve le texte original et le lien vers l’objet créé. Si la classification échoue, elle reste à traiter dans la section « Non classées » de Revue.

Une Entry n’est pas une Task ou un Project et ne remplace jamais ces objets métier.

#### Données minimales

```text
Entry
├── id
├── raw_content
├── requested_due_date?       // échéance choisie pendant la capture
├── classification_state       // pending | failed | classified
├── classification_source?     // jev | manual une fois classifiée
├── classified_object?         // exactement une Task ou un Project si classified
├── classified_at?
├── reviewed_at?
├── created_at
├── updated_at
└── deleted_at?
```

#### Règles

- aucune décision de type obligatoire pour l’utilisateur à la capture ;
- aucune date d’exécution propre à l’Entry ; `requested_due_date` conserve seulement l’échéance à appliquer à l’objet classifié ;
- `classification_state` décrit le traitement de la capture, sans être un statut de Task ou Project ;
- une Entry classifiée automatiquement quitte la section « Non classées » de Revue et reste visible dans la Revue, y compris après confirmation ;
- une Entry non classifiée reste éditable avec autosave ;
- la revue humaine n’est jamais un prérequis à l’utilisation de l’objet créé ;
- une Entry non classifiée peut être supprimée directement ; la suppression d’un objet classifié suit les règles de Trash ;
- une Entry en échec peut être relancée sans créer de doublon ;
- une Entry non classifiée peut être laissée pour plus tard pendant une session de traitement sans modifier ses données.

---

### 7.2 Task

Une `Task` est une action exécutable et finie.

#### Statuts

```text
TODO
IN_PROGRESS
DONE
CANCELLED
```

`TODO → DONE` directement est autorisé.

Les statuts terminaux ne doivent pas verrouiller l’objet : une Task terminée peut être rouverte.

#### Données fonctionnelles

```text
Task
├── id
├── title
├── description_md?
├── status
├── project_id?          // 0..1
├── checkpoint_id?       // 0..1
├── scheduled_date?
├── scheduled_time?
├── due_date?
├── due_time?
├── recurrence_rule?
├── position_in_project?
├── created_at
├── updated_at
├── completed_at?
├── cancelled_at?
└── deleted_at?
```

#### Invariants

- une Task peut vivre sans Project ;
- une Task appartient à maximum un Project ;
- une Task est liée à maximum un Checkpoint ;
- si `checkpoint_id != null`, le Checkpoint doit appartenir au même Project que la Task ;
- une Task ne possède aucune sous-tâche ;
- les checkboxes éventuelles vivent uniquement dans `description_md` ;
- une checkbox Markdown ne modifie jamais automatiquement le statut de la Task ;
- pour une Task ponctuelle, `completed_at` est renseigné automatiquement au passage à `DONE` et est remis à `null` si la Task est rouverte ;
- `cancelled_at` est renseigné automatiquement au passage à `CANCELLED`.

Lorsqu’une Task `DONE` est rouverte via l’action rapide standard, elle revient en `TODO`.

---

### 7.3 Project

Un `Project` représente un résultat concret ou un chantier durable qui regroupe des actions. Sa clôture reste facultative et toujours manuelle.

Exemples :

- refaire son portfolio ;
- repeindre une chambre ;
- préparer un marathon ;
- mettre à jour son CV.
- progresser régulièrement en dessin.

#### Statuts

```text
PLANNED
ACTIVE
PAUSED
DONE
CANCELLED
```

#### Données fonctionnelles

```text
Project
├── id
├── title
├── description_md?
├── status
├── start_date?
├── due_date?
├── started_at?
├── completed_at?
├── created_at
├── updated_at
└── deleted_at?
```

#### Sémantique des dates

- `start_date` : date à laquelle l’utilisateur prévoit de commencer le Project ;
- `due_date` : date cible à laquelle le résultat du Project devrait être atteint ;
- `started_at` : instant système de la première activation réelle ;
- `completed_at` : instant système de la clôture actuelle.

#### Règles

- un Project peut exister sans Task ;
- aucun tag ou catégorie n’est requis ou disponible en V1 ;
- la clôture est toujours manuelle ;
- terminer toutes les Tasks ne termine jamais automatiquement le Project ;
- un Project `DONE` peut être rouvert en `ACTIVE` ;
- `completed_at` est renseigné lors du passage à `DONE` et remis à `null` si le Project est rouvert ;
- `started_at` est renseigné lors de la première activation ;
- aucune date n’est obligatoire.

Transitions principales attendues :

```text
PLANNED → ACTIVE
ACTIVE ↔ PAUSED
PLANNED / ACTIVE / PAUSED → DONE ou CANCELLED
DONE → ACTIVE
```

---

### 7.4 Checkpoint

Un `Checkpoint` est un jalon observable à l’intérieur d’un Project. Il peut correspondre à un livrable intermédiaire, mais ce n’est pas obligatoire.

Ce n’est pas un conteneur de Tasks et ce n’est pas une mini-epic.

#### Statuts

```text
OPEN
DONE
CANCELLED
```

#### Données fonctionnelles

```text
Checkpoint
├── id
├── project_id           // obligatoire
├── title
├── description_md?
├── status
├── target_date?
├── position
├── completed_at?
├── created_at
├── updated_at
└── deleted_at?
```

#### Règles

- un Checkpoint appartient obligatoirement à exactement un Project ;
- il est créé uniquement depuis le contexte d’un Project ;
- il ne peut pas être créé depuis le Collector ;
- il peut exister sans Task liée ;
- les Tasks liées ne lui appartiennent pas structurellement ;
- sa clôture est manuelle ;
- il peut être rouvert (`DONE → OPEN`) ; dans ce cas `completed_at` est remis à `null` ;
- il n’existe pas d’action globale `New Checkpoint` hors du contexte d’un Project.

---

## 8. Markdown

Toutes les entités métier structurées utilisent la convention :

```text
title
+ description_md? optionnelle
```

Sont concernés :

- Task ;
- Project ;
- Checkpoint.

Le Markdown est documentaire uniquement.

Exemple :

```md
Préparer le dossier :

- [x] récupérer le justificatif
- [ ] vérifier l'adresse
- [ ] envoyer le dossier
```

Les éléments Markdown n’ont aucune conséquence métier implicite.

Une checkbox cochée ne termine pas une Task et une date écrite en Markdown ne devient pas une deadline.

L’éditeur doit proposer :

- un mode d’édition Markdown brut ;
- un mode de rendu lisible ;
- les constructions Markdown usuelles utiles au produit : paragraphes, titres, listes, emphase, liens, code et checkboxes ;
- des checkboxes Markdown **interactives** : les cocher/décocher modifie directement le Markdown source ;
- aucune toolbar rich-text obligatoire.

Les liens Markdown constituent le mécanisme léger pour référencer un document ou une ressource externe en V1 ; aucun fichier n’est uploadé dans l’application.

---

## 9. Collector

Le Collector est l’écran d’arrivée principal et le point de capture universel.

### 9.1 Interaction principale

Le Collector possède un unique champ principal.

```text
> Qu'est-ce qui te passe par la tête ?
```

Aucun autre champ n’est obligatoire. Le champ accepte plusieurs lignes afin de pouvoir capturer un titre puis du contexte Markdown. La capture doit rester réalisable en une action clavier/tactile ; le raccourci exact est laissé au design, avec un moyen distinct d’insérer une nouvelle ligne.

Un préfixe facultatif `/today`, `/thisweek`, `/thismonth` ou `/thisyear`, suivi d’un espace, devient un badge d’échéance à gauche du texte. Les dates sont calculées dans la timezone locale de l’utilisateur : aujourd’hui, le dimanche de la semaine courante, le dernier jour du mois ou le 31 décembre. `/date` ouvre un calendrier pour choisir une date. Le badge peut être modifié ou retiré avant la capture. Les commandes ne font pas partie du titre ni du texte transmis à Jev.

### 9.2 Capture classifiée par Jev

L’action primaire ne demande aucun type :

```text
capture → Entry persistée → Jev → Task | Project → Revue
```

Jev choisit parmi ces deux types définis par l’application. Un résultat valide crée immédiatement l’objet métier, utilisable avant toute revue humaine. L’Entry conserve la capture d’origine, le type retenu et un lien vers cet objet ; la Revue montre toutes les classifications automatiques, confirmées ou non. Le texte de la capture est transmis à OpenRouter et TypeSafe pour cette décision.

Le Collector confirme la persistance de l’Entry sans attendre Jev et reste disponible pour une autre capture. Une notification visible indique d’abord que le classement est en cours, puis le type retenu et, pour une Task, le Project de rattachement s’il existe. Elle indique aussi l’absence de rattachement.

En cas d’échec de Jev ou de réponse invalide, l’Entry reste non classifiée. L’utilisateur peut relancer la classification ou la traiter manuellement depuis la section « Non classées » de Revue.

Si une échéance a été choisie, l’Entry la conserve lors d’un échec et d’une relance. La Task ou le Project créé reçoit cette `due_date`, y compris après un classement manuel. Une correction ultérieure du type dans la Revue préserve la date d’échéance actuelle, commune aux deux types.

### 9.3 Rattachement facultatif

Après avoir choisi `Task`, Jev peut proposer un Project **existant**. L’option « aucun rattachement » est toujours disponible. Jev ne crée jamais automatiquement un conteneur supplémentaire et ne rattache jamais directement une Task à un Checkpoint.

Un rattachement incertain, invalide ou devenu indisponible laisse la Task autonome. Un Project est toujours autonome. La Revue permet de corriger le rattachement d’une Task.

### 9.4 Choix manuel après échec

Dans « Non classées », un choix manuel permet de créer une Task ou un Project sans nouvel appel à Jev. L’Entry correspondante garde la trace de la capture mais ne figure pas parmi les classifications automatiques à revoir.

### 9.5 Transformation du contenu

Règle universelle :

```text
première ligne non vide → title
reste du contenu        → description_md
```

Exemple :

```md
Refaire mon CV

Ajouter mon expérience actuelle.
Vérifier toutes les dates.
```

Devient :

```text
title = "Refaire mon CV"
description_md = "Ajouter mon expérience actuelle.\nVérifier toutes les dates."
```

Aucun titre ni description n’est généré par Jev. La règle première ligne / reste du contenu s’applique à la capture automatique comme au choix manuel.

Le texte après retrait de la commande constitue `raw_content` ; la date choisie est conservée séparément dans `requested_due_date`.

### 9.6 Garantie de persistance

Le champ du Collector ne doit être vidé qu’après confirmation de la persistance de l’Entry. Une erreur Jev après cette confirmation n’annule pas la capture : l’interface indique que l’Entry est enregistrée et propose `Réessayer` dans le parcours de secours.

Si la confirmation serveur n’arrive pas :

- le texte reste affiché ;
- un état d’erreur clair est présenté ;
- une action `Retry` est disponible ;
- une nouvelle tentative de la même capture ne crée aucun doublon.

Après confirmation, le champ est vidé, un feedback bref est donné et le focus reste prêt pour une nouvelle capture. Aucune modal ni navigation n’est imposée.

Le classement Jev se poursuit côté serveur après cette confirmation. Si le processus est interrompu, l’Entry persistée reste récupérable et peut être relancée ; le navigateur n’attend pas l’appel à Jev pour reprendre la saisie.

---

## 10. Revue

### 10.1 Revue des classifications automatiques

`Revue` est l’entrée de navigation principale. Elle affiche toutes les captures classifiées automatiquement par Jev, récentes en premier, avec le texte d’origine, le type et le rattachement retenus, ainsi que l’état « à revoir » ou « confirmé ». Les captures confirmées restent consultables. Un filtre permet de ne voir que celles à revoir.

Une classification Jev est appliquée avant confirmation humaine : la Revue sert à vérifier et corriger, pas à autoriser la création de l’objet.

### 10.2 Confirmer et corriger

Depuis la Revue, l’utilisateur peut :

- confirmer la classification sans changer l’objet ;
- corriger le type `Task` / `Project` proposé par Jev ;
- corriger ou retirer le Project d’une Task ;
- ouvrir l’objet créé pour l’enrichir dans sa page habituelle.

Une correction de type remplace transactionnellement l’objet classifié automatiquement et met à jour le lien de l’Entry. Le texte, le titre et la description restent disponibles. Aucune relation enfant ni champ propre à l’ancien type n’est supprimé ou converti silencieusement : si une conversion ne peut pas préserver ces données, l’interface explique le conflit et demande de le résoudre d’abord. Les conversions générales hors de ce parcours restent exclues.

La confirmation renseigne `reviewed_at`. Une correction le renseigne également. La Revue indique clairement qu’une décision est automatique tant qu’elle n’a pas été confirmée ou corrigée.

### 10.3 Captures non classées

La section « Non classées » est accessible depuis `Revue` lorsqu’au moins une capture attend un classement. Elle contient uniquement les Entries non classifiées, y compris celles dont l’appel Jev a échoué. La liste est affichée de la plus récente à la plus ancienne. Une action `Réessayer avec Jev` est proposée pour les échecs.

Le traitement manuel séquentiel prend la capture la plus ancienne en premier, avec `Task`, `Project`, `Plus tard` et `Supprimer`. Classifier manuellement crée l’objet et retire l’Entry de cette section sans effacer la capture d’origine. `Plus tard` ne modifie aucune donnée. Une Entry non classifiée reste éditable et supprimable.

### 10.4 Checkpoints

Un Checkpoint n’est jamais proposé comme classification par Jev ou dans la section « Non classées » de Revue.

---

## 11. Dates et planification des Tasks

Une Task ponctuelle distingue :

```text
scheduled_date/time
→ quand l'utilisateur compte s'en occuper

due_date/time
→ limite à ne pas dépasser
```

Les heures sont facultatives.

Exemples :

```text
scheduled_date = vendredi
scheduled_time = null
```

ou :

```text
scheduled_date = vendredi
scheduled_time = 14:30
```

Même logique pour une deadline.

Une Task planifiée mais non réalisée n’est jamais déplacée automatiquement au jour suivant.

Elle reste liée à son intention originale tant que l’utilisateur ne la replanifie pas.

Pour une Task ponctuelle, `completed_at` et `cancelled_at` sont des métadonnées système renseignées automatiquement lors des transitions correspondantes ; elles ne remplacent pas `scheduled` ou `due`.

---

## 12. Tâches récurrentes

La récurrence reste volontairement minimale et vit directement sur `Task`.

Il n’existe aucune entité `Routine`, aucune série séparée et aucun modèle d’occurrence.

### 12.1 Invariant principal

Une Task récurrente représente une seule occurrence courante à la fois.

```text
Task récurrente
→ scheduled_date obligatoire
→ scheduled_time optionnelle
→ due_date / due_time interdits
→ recurrence_rule obligatoire
```

L’heure éventuelle sert uniquement à ordonner/afficher l’action dans les vues temporelles ; elle ne crée aucun rappel en V1.

### 12.2 Règles V1 supportées

- tous les jours ;
- certains jours de la semaine ;
- toutes les `N` semaines ;
- tous les mois à un jour donné.

Pas de quota du type `3 fois par semaine`.

### 12.3 Complétion

Quand une Task récurrente est marquée `DONE` :

1. l’action courante est considérée accomplie ;
2. l’interface fournit un feedback immédiat, idéalement avec la prochaine date et `Undo` ;
3. la Task repasse immédiatement en `TODO` ;
4. `scheduled_date` est déplacée vers le prochain créneau de la règle, en considérant l’occurrence courante comme consommée.

Une Task récurrente ne demeure donc jamais dans `DONE` et ne rejoint pas l’historique des Tasks terminées après chaque exécution.

Exemple :

```text
Tous les jeudis
Prévue jeudi 17
Done
→ prochaine date : jeudi 24
→ status : TODO
```

### 12.4 Retard

Si une Task récurrente n’est pas accomplie :

- elle reste l’unique occurrence courante ;
- elle devient simplement `Late` par calcul ;
- aucune nouvelle Task n’est générée ;
- plusieurs occurrences en retard ne s’empilent jamais.

### 12.5 Report

Reporter une Task récurrente modifie uniquement son exécution courante.

La règle d’origine reste inchangée.

Exemple :

```text
règle : chaque lundi
lundi 14 → report au mardi 15
Done mardi 15
→ prochaine date : lundi 21
```

### 12.6 Calcul du prochain créneau

L’occurrence courante est toujours considérée consommée, même si elle est terminée en avance. La prochaine date est le **premier match de la règle strictement après à la fois le créneau courant et le moment de complétion**.

Cela couvre les trois cas :

```text
Chaque jeudi, prévue jeudi 17, faite jeudi 17
→ jeudi 24

Chaque jeudi, prévue jeudi 24, faite en avance mercredi 23
→ jeudi 1er suivant (le jeudi 24 est l’occurrence déjà consommée)

Chaque jeudi, prévue jeudi 3, faite très en retard vendredi 25
→ premier jeudi futur après le 25
```

Ainsi, les créneaux théoriques déjà dépassés ne sont jamais recréés et une complétion anticipée ne provoque pas une seconde occurrence immédiate.

### 12.7 Mensuel sur une date impossible

Si la règle vise un jour qui n’existe pas dans un mois, utiliser le dernier jour de ce mois.

Exemple :

```text
31 janvier
28/29 février
31 mars
30 avril
```

### 12.8 Annulation

Pour une Task récurrente, `CANCELLED` arrête la récurrence jusqu’à réouverture éventuelle. La `recurrence_rule` est conservée.

Il n’existe pas de `Skip once` en V1.

Lors d’une réouverture après une longue période, la Task revient en `TODO` et la prochaine date est recalculée au premier match futur de la règle. Aucun rattrapage historique n’est généré.

Si l’utilisateur retire complètement la récurrence, l’objet redevient une Task ponctuelle normale et peut à nouveau recevoir une `due_date` / `due_time`.

### 12.9 Historique

La V1 ne conserve **aucun historique fonctionnel d’occurrences** : pas de liste des exécutions passées, pas de `SKIPPED`, pas de streak et pas d’exigence de `last_completed_at`. Le champ `completed_at` d’une Task ponctuelle ne doit pas être détourné pour créer implicitement cet historique sur une Task récurrente.

---

## 13. Comportement des Projects

### 13.1 `TO_BUILD`

`TO_BUILD` est un indicateur calculé, jamais un statut stocké.

Un Project est `TO_BUILD` si :

```text
status ∈ {PLANNED, ACTIVE, PAUSED}
AND tasks.count == 0
AND checkpoints.count == 0
```

La description et les dates ne sont jamais nécessaires pour retirer cet indicateur.

### 13.2 Pause

Un Project `PAUSED` ne modifie aucune Task.

Ses Tasks sont masquées des suggestions ordinaires et de la section générale `In Progress`. En revanche, une Task ayant une contrainte temporelle explicite — planification, deadline ou échéance courante d’une Task récurrente — reste visible dans les vues temporelles pertinentes (`Late`, `Today`, `Upcoming`). La contrainte temporelle prend donc le pas sur la pause pour l’exposition, sans modifier le statut de la Task.

### 13.3 Project `DONE` ou `CANCELLED`

Lorsqu’un Project devient `DONE` ou `CANCELLED` :

- ses Tasks gardent leur statut ;
- aucune Task n’est automatiquement terminée ou annulée ;
- ses Tasks sont masquées de toutes les vues d’exécution, y compris si elles portent encore une date ou une deadline ;
- elles restent visibles depuis le Project ;
- elles peuvent être déplacées vers un autre Project ou rendues autonomes.

Si des Tasks restent ouvertes au moment de la clôture, l’interface affiche un avertissement simple avant confirmation.

### 13.4 Progression

Pas de pourcentage global.

La page Project expose uniquement des faits comme :

```text
Tasks: 8 / 12 done
Checkpoints: 1 / 3 reached
Next checkpoint: Version publiable — 1 Nov
```

Le prochain Checkpoint ouvert peut être mis en évidence lorsqu’il possède une date cible, sans produire de score global.

---

## 14. Checkpoints et Tasks dans un Project

Les Checkpoints et les Tasks sont affichés dans deux sections distinctes.

Exemple :

```text
CHECKPOINTS
✓ Contenu prêt
○ Version publiable
○ Mise en production

TASKS
□ Corriger le responsive     → Version publiable
□ Acheter le domaine
□ Tester les liens           → Version publiable
```

La relation entre une Task et un Checkpoint est contextuelle uniquement.

Les Tasks ne sont pas imbriquées structurellement sous les Checkpoints.

### 14.1 Ordre manuel

Les Tasks d’un Project peuvent être réordonnées manuellement.

Les Checkpoints d’un Project peuvent également être réordonnés manuellement.

Cet ordre n’a aucune influence sur :

- Home ;
- Today ;
- Late ;
- recherche ;
- statut ;
- urgence.

---

## 15. Déplacement d’une Task

Une Task peut être déplacée librement d’un Project vers un autre, ou devenir autonome.

Si ce changement rend son `checkpoint_id` invalide :

```text
checkpoint_id → null
```

Exemple :

```text
Avant
project = Portfolio
checkpoint = Version publiable

Après déplacement
project = Refonte LinkedIn
checkpoint = null
```

L’interface fournit un feedback clair et un Undo.

---

## 16. Home / Collector

La Home est l’écran d’arrivée.

Elle répond à deux questions :

> Qu’est-ce que je veux capturer ?  
> Qu’est-ce qui réclame mon attention maintenant ?

Structure recommandée :

```text
COLLECTOR
> __________________________________

LATE
...

IN PROGRESS
...

TODAY
...
```

### 16.1 Late

Inclut notamment :

- deadline dépassée ;
- Task planifiée dans le passé et non traitée ;
- Task récurrente dont l’exécution courante est dépassée.

### 16.2 In Progress

Les Tasks `IN_PROGRESS` exposables selon les règles de leur Project. Une Task appartenant à un Project `PAUSED` n’apparaît pas ici par défaut ; si elle possède une contrainte temporelle, elle remonte dans la section temporelle pertinente (`Late` ou `Today`) plutôt que comme simple `In Progress`. Les Tasks d’un Project `DONE` ou `CANCELLED` n’apparaissent jamais sur la Home.

### 16.3 Today

Inclut notamment :

- Tasks planifiées aujourd’hui ;
- Tasks récurrentes prévues aujourd’hui ;
- deadlines du jour.

### 16.4 Déduplication

Une même Task ne doit pas être affichée plusieurs fois sur la Home.

Les autres dimensions temporelles ou de statut sont représentées par des badges secondaires. Exemple accepté : une Task `IN_PROGRESS` avec une deadline aujourd’hui reste affichée une seule fois avec un indicateur `due today`, plutôt que d’être dupliquée.

### 16.5 Backlog

Une Task `TODO` sans date ne remonte pas automatiquement sur la Home.

---

## 17. Page Tasks

La page `Tasks` représente le backlog global des Tasks uniquement.

Par défaut, elle affiche les Tasks ouvertes :

```text
TODO
IN_PROGRESS
```

Les Tasks appartenant à un Project `DONE` ou `CANCELLED` sont exclues des vues d’exécution globales par défaut et restent consultables depuis leur Project.

Pour un Project `PAUSED`, les Tasks non datées et les simples `IN_PROGRESS` ne remontent pas dans le backlog d’exécution global ; seules les Tasks ayant une contrainte temporelle explicite peuvent encore apparaître dans les groupes temporels (`LATE`, `UPCOMING`, et `TODAY` sur la Home).

Les Tasks `DONE` et `CANCELLED` sont accessibles via une vue ou un filtre d’historique.

### 17.1 Groupes recommandés

```text
IN PROGRESS
LATE
UPCOMING
UNSCHEDULED
```

### 17.2 Filtres V1

Filtres simples uniquement :

- Project ;
- statut ;
- scheduled / unscheduled.

Pas de vues sauvegardées ni de filtres avancés.

### 17.3 Distinction entre captures non classées, Revue et Unscheduled

```text
Non classées (dans Revue)
= la capture n'a pas encore d'objet classifié

Revue
= la capture a été classifiée automatiquement et peut être vérifiée

Unscheduled
= c'est bien une Task, mais aucune date d'exécution n'est définie
```

---

## 18. Page Projects

La page globale `Projects` constitue la vue d’ensemble des projets.

Regroupement par statut recommandé :

```text
PLANNED
ACTIVE
PAUSED
DONE
CANCELLED
```

Chaque élément peut exposer :

- titre ;
- statut ;
- indicateur `TO_BUILD` ;
- nombre de Tasks ouvertes / terminées ;
- nombre de Checkpoints atteints / totaux ;
- dates principales si présentes.

### 18.1 Détail Project

Structure recommandée :

```text
PROJECT
Titre
Status
Start / Due

Description.md

CHECKPOINTS
...

OPEN TASKS
...

COMPLETED TASKS
...
```

Les Tasks terminées peuvent être repliées par défaut.

Si un prochain Checkpoint daté existe, le détail Project peut le mettre en évidence comme prochain jalon factuel.

---

## 19. Création contextuelle

Le Collector n’est pas le seul point de création.

Les vues contextuelles permettent de créer rapidement un objet déjà rattaché au bon contexte.

```text
Project page
→ Add Task
→ Add Checkpoint

Tasks page
→ Add Task

Projects page
→ Add Project
```

Les créations contextuelles utilisent un input minimal, sans grosse modal obligatoire.

Exemple :

```text
+ Add task
> Corriger le responsive mobile
Enter
```

Depuis un Project, la nouvelle Task reçoit automatiquement le `project_id` courant.

Les champs de création rapide de Task, dans Tasks et dans un Project, acceptent les mêmes commandes d’échéance et le même calendrier. La date est enregistrée avec la Task dès sa création ; une erreur de sauvegarde conserve le titre et le badge saisis.

---

## 20. Recherche globale

La recherche globale est accessible depuis n’importe quelle vue, idéalement via `Ctrl/Cmd + K`.

### 20.1 Contenu indexé

Recherche simple dans :

```text
Task.title
Task.description
Project.title
Project.description
Checkpoint.title
Checkpoint.description
```

### 20.2 Présentation

Les résultats sont groupés par type et fournissent juste assez de contexte pour comprendre leur origine.

Exemple :

```text
PROJECT
Refaire mon portfolio
ACTIVE

TASK
Corriger responsive mobile
Portfolio · TODO
```

Pas de query language, de moteur avancé ou de filtres complexes en V1.

---

## 21. Actions rapides

Les actions fréquentes doivent être réalisables directement depuis les listes.

### 21.1 Task

Action principale :

```text
TODO → DONE
IN_PROGRESS → DONE
```

Actions secondaires :

```text
Start
Cancel
Edit
Move
```

Une Task `DONE` peut être rouverte.

### 21.2 Checkpoint

Action principale : `OPEN → DONE`.

`Cancel` reste secondaire.

### 21.3 Undo

Les actions rapides importantes affichent un feedback temporaire avec `Undo`.

Exemples :

- Mark done ;
- Reopen ;
- Start ;
- Cancel ;
- Complete checkpoint ;
- Delete ;
- Move Task.

Il n’existe aucun historique global d’Undo.

---

## 22. Autosave et gestion des erreurs

### 22.1 Autosave

Les éditions ordinaires utilisent l’autosave :

- titre ;
- description ;
- dates ;
- relations ;
- contenu Markdown.

États possibles :

```text
Editing
Saving
Saved
Save failed
```

`Saved` ne doit jamais être affiché avant confirmation serveur.

### 22.2 Échec réseau

En cas d’échec :

- conserver l’état local saisi ;
- ne pas restaurer silencieusement l’ancienne version serveur ;
- afficher une erreur inline ;
- proposer `Retry`.

### 22.3 Confirmations

Les confirmations doivent être rares.

Actions ordinaires : immédiates + Undo.

Actions destructrices ou aux conséquences moins évidentes : confirmation ciblée.

Exemples :

- Delete ;
- Cancel Project ;
- Cancel recurring Task ;
- clôturer un Project avec des Tasks ouvertes.

---

## 23. Suppression et Trash

`Delete` est distinct de `CANCELLED`.

```text
Cancel
= l'objet a existé mais on décide de ne plus l'accomplir

Delete
= la donnée ne devrait plus être présente dans l'usage normal
```

La suppression passe par une Trash récupérable pendant une durée limitée. Depuis la Trash, l’utilisateur peut restaurer un objet ou demander sa purge définitive ; la purge définitive doit être explicitement confirmée.

### 23.1 Suppression d’un Project

```text
Delete Project
→ Tasks conservées
→ project_id = null
→ checkpoint_id = null si nécessaire
→ Checkpoints supprimés avec le Project
```

### 23.2 Suppression d’un Checkpoint

```text
Delete Checkpoint
→ Tasks conservées
→ checkpoint_id = null
```

### 23.3 Suppression d’une Task

```text
Delete Task
→ suppression de la Task uniquement
```

La durée exacte de rétention dans la Trash est une décision d’implémentation à fixer pendant l’architecture. La restauration et la purge définitive manuelle doivent être disponibles en V1.

---

## 24. Navigation

Navigation principale recommandée :

```text
Collector / Home
Revue
Tasks
Projects
Search
```

La navigation principale mène à Revue ; le filtre « Non classées » y apparaît lorsqu’une capture est en attente ou en échec.

Les Checkpoints sont accessibles uniquement à travers les Projects.

La navigation peut exposer des badges de compte internes utiles (`Revue`, `Late`, `Today`) afin de rendre l’état immédiatement visible, sans notification externe.

La Trash peut être accessible depuis un menu secondaire / settings et ne doit pas encombrer la navigation principale.

Il n’existe aucune page globale `Overview` en V1.

---

## 25. Desktop et keyboard-first

La V1 desktop doit être efficacement utilisable sans souris pour les actions fréquentes.

Sont notamment couverts :

- focus du Collector ;
- recherche globale ;
- navigation dans les listes ;
- ouverture d’un objet ;
- création contextuelle ;
- complétion d’une Task ;
- passage en `IN_PROGRESS` ;
- fermeture / retour.

Les raccourcis exacts seront fixés pendant le design/implémentation.

`Ctrl/Cmd + K` est recommandé pour la recherche / command palette. Cette palette peut servir à rechercher, naviguer vers une section et lancer quelques actions simples ; elle ne doit pas devenir un langage de commandes complexe.

La V1 ne cherche pas à reproduire un système modal complet de type Vim.

---

## 26. Mobile

Le mobile possède une parité fonctionnelle complète avec le desktop.

Tout workflow métier doit être réalisable au tactile.

La disposition peut différer :

- navigation compacte / bottom navigation ;
- actions adaptées au tactile ;
- Collector immédiatement accessible ;
- aucun workflow ne doit dépendre d’un raccourci clavier.

---

## 27. Direction UI

L’interface doit être :

- minimaliste ;
- très lisible ;
- orientée développeur ;
- moderne / sleek ;
- rapide visuellement ;
- peu chargée en chrome ;
- basée sur de grands libellés et icônes claires lorsque pertinent ;
- avec **JetBrains Mono** comme direction typographique privilégiée pour l’identité de l’interface, sous réserve des contraintes finales d’implémentation/licence ;
- conçue pour réduire le nombre de clics avant une action utile.

La hiérarchie visuelle doit favoriser le contenu et les actions plutôt que les dashboards décoratifs.

Le thème sombre est affiché par défaut. Un contrôle accessible permet de passer au thème clair ou de revenir au sombre ; le choix est conservé dans ce navigateur et s'applique aussi à la page de connexion.

---

## 28. Authentification et modèle utilisateur

La V1 est strictement mono-utilisateur.

```text
1 owner
1 personal space
0 workspace
0 team
0 role
0 sharing
```

Règles :

- aucun signup public ;
- un seul compte propriétaire préexistant ;
- toutes les routes métier sont privées ;
- aucune donnée accessible par URL publique ;
- aucun partage par lien ;
- session suffisamment persistante pour ne pas imposer des reconnexions fréquentes.

Le mécanisme exact d’authentification est une décision d’architecture technique.

---

## 29. Online-first

La V1 nécessite une connexion Internet pour lire et modifier les données.

Il n’existe pas de :

- mode offline ;
- file locale de mutations ;
- résolution de conflits offline ;
- synchronisation différée.

Invariant :

> aucune action ne doit donner l’impression d’être persistée tant que le serveur ne l’a pas confirmée.

---

## 30. Exigences non fonctionnelles V1

Les exigences restent qualitatives dans le PRD. Les budgets chiffrés seront définis pendant l’architecture.

### Performance perçue

- actions courantes perçues comme instantanées ;
- navigation sans rechargement visuel lourd ;
- Collector utilisable immédiatement à l’arrivée ;
- feedback immédiat sur les actions rapides.

### Responsive

- téléphone ;
- tablette si naturellement couverte ;
- laptop ;
- grand écran.

### Navigateurs

Support des navigateurs modernes uniquement.

### Accessibilité minimale

- focus visibles ;
- navigation clavier correcte ;
- contraste suffisant ;
- aucune information critique uniquement communiquée par la couleur ;
- zones tactiles confortables sur mobile.

### Dates et timezone

- utiliser la timezone de l’utilisateur ;
- affichage cohérent des dates/heures sur tous les appareils ;
- date + heure facultative pour Tasks ;
- dates seulement pour Projects et Checkpoints.

### Fiabilité

- aucune perte silencieuse de saisie ;
- états de sauvegarde fiables ;
- actions destructrices récupérables via Trash ou Undo lorsque pertinent.

---

## 31. User flows principaux

### 31.1 Capturer sans réfléchir

```text
Home
→ saisir contenu
→ Enter
→ Entry persistée
→ confirmation serveur, Collector vidé et prêt pour une autre capture
→ Jev classe en Task / Project
→ objet créé et utilisable
→ notification du type et du rattachement éventuel
→ capture visible dans Revue pour vérification facultative
```

Si Jev échoue après la persistance, l’Entry reste dans la section « Non classées » de Revue avec `Réessayer avec Jev` ; la capture n’est pas perdue.

### 31.2 Classer manuellement après un échec

```text
Home
→ saisir contenu
→ persistance confirmée
→ Jev échoue
→ Revue → Non classées
→ choisir Task
→ Task créée et capture conservée
```

### 31.3 Revoir ou corriger Jev

```text
Revue
→ voir le texte original, le type et le rattachement proposés
→ confirmer ou corriger le type / rattachement
→ l’objet reste utilisable, la capture reste consultable
```

Si Jev n’a pas classifié la capture :

```text
Revue → Non classées
→ Traitement séquentiel
→ Entry la plus ancienne
→ Réessayer avec Jev ou choisir Task / Project
→ objet créé
→ Entry retirée de la section « Non classées » de Revue
→ suivante
```

### 31.4 Enrichir un Project

```text
Project
→ description Markdown
→ dates optionnelles
→ Add Task
→ Add Checkpoint
→ réordonner si nécessaire
```

### 31.5 Exécuter une Task

```text
Home / Tasks / Project
→ clic principal
→ DONE
→ feedback + Undo
```

### 31.6 Démarrer explicitement une Task

```text
Task TODO
→ Start
→ IN_PROGRESS
→ visible dans In Progress
```

### 31.7 Terminer une Task récurrente

```text
Task récurrente
→ Done
→ feedback
→ scheduled recalculé au prochain match futur
→ status = TODO
```

### 31.8 Reporter une Task récurrente

```text
Task récurrente planifiée lundi
→ Postpone mardi
→ scheduled = mardi pour l'exécution courante
→ règle de récurrence reste lundi
→ Done mardi
→ prochaine date future correspondant à lundi
```

### 31.9 Fermer un Project avec Tasks ouvertes

```text
Project ACTIVE
→ Done
→ avertissement si Tasks ouvertes
→ confirmer
→ Project DONE
→ Tasks inchangées
→ Tasks masquées des vues d'exécution
```

### 31.10 Déplacer une Task

```text
Task Project A / Checkpoint A
→ move vers Project B
→ project_id = B
→ checkpoint_id = null
→ feedback + Undo
```

---

## 32. Critères d’acceptation fonctionnels

La V1 est considérée fonctionnellement complète lorsque les scénarios suivants sont fiables.

### Collector

- capturer et classifier automatiquement depuis desktop ;
- capturer et classifier automatiquement depuis mobile ;
- saisir une capture multi-ligne sans déclencher accidentellement l’envoi ;
- aucune perte si la sauvegarde échoue ;
- vider le Collector uniquement après confirmation de persistance ;
- conserver l’Entry et proposer une relance si Jev échoue ;
- éviter les doublons lors d’une nouvelle tentative de capture ;
- classer manuellement une capture en Task ou Project depuis la Revue ;
- appliquer correctement la règle première ligne / description.

### Revue et captures non classées

- afficher toutes les classifications Jev, y compris celles déjà confirmées, les plus récentes en premier ;
- confirmer ou corriger le type et le rattachement depuis la Revue ;
- ne jamais supprimer silencieusement des données lors d’une correction de type ;
- laisser un rattachement vide si aucun Project admissible n’est choisi avec assez de certitude ;
- proposer le filtre « Non classées » dans la Revue lorsqu’au moins une capture en a besoin ;
- afficher les Entries non classifiées, les plus récentes en premier dans la section « Non classées » de Revue ;
- éditer une Entry avant classification avec autosave ;
- relancer Jev sur une Entry en échec ;
- traiter séquentiellement la section « Non classées » de Revue, les plus anciennes en premier ;
- classifier en Task ou Project ;
- quitter la section « Non classées » de Revue dès la classification, sans exiger de spécification complète ;
- utiliser `Plus tard` sans mutation ;
- supprimer une Entry.

### Tasks

- CRUD complet ;
- `TODO / IN_PROGRESS / DONE / CANCELLED` ;
- `TODO → DONE` directement depuis une liste ;
- `DONE → TODO` via réouverture rapide, avec nettoyage de `completed_at` ;
- dates planifiées et deadlines avec heure optionnelle ;
- absence de déplacement automatique d’une date ratée ;
- Tasks autonomes ou liées à un Project ;
- relation optionnelle à un Checkpoint compatible ;
- réordonnancement manuel dans un Project ;
- checkboxes Markdown interactives sans effet sur le statut métier ;
- gestion de Tasks récurrentes simples ;
- Task récurrente avec `scheduled` obligatoire et `due` interdit ;
- une seule occurrence courante pour une Task récurrente ;
- report d’une Task récurrente sans modifier la cadence ;
- complétion anticipée ou tardive calculant le bon prochain créneau sans empiler d’occurrences ;
- annulation d’une Task récurrente sans `Skip once`, puis réouverture au prochain créneau futur.

### Projects

- CRUD complet ;
- `PLANNED / ACTIVE / PAUSED / DONE / CANCELLED` ;
- Project vide autorisé ;
- indicateur `TO_BUILD` calculé uniquement sur les Projects ouverts sans Task ni Checkpoint ;
- dates optionnelles avec distinction intention (`start_date` / `due_date`) et historique (`started_at` / `completed_at`) ;
- Tasks et Checkpoints ;
- clôture manuelle ;
- avertissement en cas de Tasks ouvertes ;
- réouverture `DONE → ACTIVE` sans historique complexe ;
- aucune cascade automatique de statut.

### Checkpoints

- création uniquement depuis Project, sans création globale ni Collector ;
- `OPEN / DONE / CANCELLED` ;
- date cible optionnelle ;
- ordre manuel ;
- Tasks liées affichées sans imbrication structurelle ;
- réouverture `DONE → OPEN` possible.

### Exécution

- Home affiche correctement `Late / In Progress / Today` ;
- une même Task n’est pas dupliquée ;
- les Tasks sans date restent hors Home ;
- les Tasks d’un Project `PAUSED` sont masquées des suggestions ordinaires mais réapparaissent si une contrainte temporelle explicite l’exige ;
- les Projects `DONE/CANCELLED` masquent leurs Tasks de toutes les vues d’exécution, même datées ;
- aucun changement de statut enfant n’est provoqué par ces règles d’exposition.

### Recherche

- recherche globale depuis n’importe quelle vue ;
- title + description ;
- résultats Task / Project / Checkpoint ;
- navigation directe vers un résultat.

### Fiabilité

- autosave ;
- état de sauvegarde fiable ;
- erreurs inline ;
- Retry ;
- Undo sur actions rapides ;
- Trash récupérable ;
- restauration et purge définitive confirmée depuis la Trash ;
- aucune cascade destructrice silencieuse.

### Multi-device

- tous les workflows essentiels réalisables sur desktop ;
- tous les workflows essentiels réalisables sur mobile ;
- données cohérentes via le serveur.

---

## 33. Définition de sortie V1

La V1 est terminée lorsqu’elle peut servir pendant plusieurs semaines de gestionnaire personnel principal pour le scope défini, sans devoir revenir à Notes ou Jira pour les workflows couverts.

L’utilisateur doit pouvoir :

1. capturer depuis téléphone et desktop ;
2. vérifier les classifications Jev dans la Revue et traiter les éventuels échecs dans la section « Non classées » de Revue ;
3. créer et gérer Tasks, Projects et Checkpoints ;
4. planifier des Tasks et des deadlines ;
5. utiliser les Tasks récurrentes simples ;
6. voir correctement `Late / In Progress / Today` ;
7. gérer le backlog depuis `Tasks` ;
8. suivre l’état d’un Project et ses Checkpoints ;
9. retrouver un objet via la recherche globale ;
10. modifier, supprimer et restaurer sans perdre silencieusement de données ;
11. utiliser l’application entièrement au tactile et largement au clavier sur desktop.

Tout ce qui n’est pas nécessaire à cette boucle reste hors scope.

---

## 34. Questions réservées à la phase architecture / stack

Ces décisions ne doivent pas modifier le comportement produit défini ci-dessus :

- PWA ou autre stratégie de distribution web ;
- framework frontend ;
- backend / API ;
- base de données ;
- stratégie d’authentification du compte propriétaire ;
- représentation technique de `recurrence_rule` ;
- stratégie de recherche ;
- mécanisme d’autosave ;
- stratégie de soft-delete / durée de rétention Trash ;
- gestion de timezone côté stockage ;
- cache réseau online-first ;
- déploiement ;
- observabilité ;
- sauvegardes ;
- tests ;
- budgets de performance chiffrés ;
- détail exact des raccourcis clavier.

---

## 35. Idées explicitement différées pour une V2+

À reconsidérer seulement si l’usage réel les justifie :

- génération automatique de titres, descriptions, dates ou autres spécifications à partir de la capture ;
- rappels et notifications ;
- vrai mode offline ;
- historique d’occurrences récurrentes ;
- habit tracking ;
- `N fois par semaine` ;
- attachments ;
- tags ou Areas ;
- focus/pin ;
- recherche avancée ;
- page Overview structurelle ;
- statistiques ;
- intégrations calendrier/email ;
- partage ;
- collaboration ;
- multi-utilisateur.

---

## 36. Registre consolidé des décisions produit

Cette section sert de garde-fou de traçabilité. Elle ne remplace pas les spécifications détaillées ci-dessus ; elle récapitule les décisions produit, y compris celles ajoutées pour la slice Jev, afin d’éviter leur réintroduction accidentelle pendant l’architecture ou l’implémentation.

### Capture, Jev et Revue

- boucle de référence : `Capture → Classification automatique → Revue facultative → Organisation → Exécution → Accomplissement` ;
- seul le contenu est obligatoire à la capture ;
- une capture du Collector devient une Entry persistée avant l’appel à Jev ;
- Jev classifie en Task ou Project sans attendre une confirmation humaine ;
- les classifications Jev restent visibles dans la Revue, même après confirmation ;
- une capture non classifiée ou en échec reste dans la section « Non classées » de Revue ;
- la spécification est progressive, le rattachement automatique est facultatif ;
- classifications disponibles : `Task`, `Project` uniquement ;
- `Checkpoint` n’est jamais une classification du Collector ou de Jev ;
- `Plus tard` ne crée ni statut, ni date, ni snooze ;
- la correction d’une classification Jev peut changer le type depuis la Revue, sans perte silencieuse de données ; les autres conversions restent exclues.

### Modèle métier

- `Project` = résultat concret ou chantier durable ; `Checkpoint` = jalon observable d’un Project ; `Task` = action exécutable ;
- aucun modèle `Goal` séparé ;
- aucun tag, Area, priorité, dépendance, sous-tâche ou checklist structurée ;
- une Task a au plus un Project et un Checkpoint du même Project ;
- un Checkpoint appartient toujours à exactement un Project.

### États

- Task : `TODO / IN_PROGRESS / DONE / CANCELLED` ;
- Project : `PLANNED / ACTIVE / PAUSED / DONE / CANCELLED` ;
- Checkpoint : `OPEN / DONE / CANCELLED` ;
- `LATE`, `OVERDUE`, `TO_BUILD` sont calculés et ne sont pas des statuts persistés ;
- aucun `DRAFT`, `BLOCKED`, `ON_HOLD`, `BACKLOG` ou `REVIEW` métier en V1.

### Exécution

- une Task peut passer directement de `TODO` à `DONE` ;
- la complétion depuis les listes est une action primaire en un clic/tap ; `Start`, `Cancel` et autres actions moins fréquentes restent secondaires ;
- aucune fermeture de Project n’est automatique lorsque toutes ses Tasks sont terminées ;
- aucune propagation silencieuse de statut depuis un Project vers ses Tasks ;
- Project `PAUSED` masque les suggestions ordinaires mais pas les obligations temporelles explicites ;
- Project `DONE/CANCELLED` masque ses Tasks des vues d’exécution même si elles ont encore des dates.

### Temps et récurrence

- Task ponctuelle : `scheduled` = intention d’exécution, `due` = limite ; les deux sont optionnels et peuvent comporter une heure optionnelle ;
- Project/Checkpoint : dates au niveau jour uniquement ;
- aucune date planifiée n’est déplacée automatiquement ;
- récurrence = propriété simple d’une Task, sans `Routine`, série ou occurrence séparée ;
- une seule occurrence courante existe à la fois ;
- Task récurrente : `scheduled` obligatoire, `due` interdit ;
- `Done` consomme l’occurrence courante, repasse immédiatement la Task en `TODO` et programme le prochain créneau ;
- report d’une exécution ne modifie jamais la cadence d’origine ;
- aucun historique d’occurrences, aucun `Skip once`, aucun streak.

### Interface et fiabilité

- Home = Collector + `Late / In Progress / Today`, pas un dashboard général ;
- `Tasks` = backlog global, `Revue` = classifications Jev et captures non classées dans un filtre dédié ;
- pas de page Overview V1 ;
- recherche globale simple sur titres + descriptions ;
- Markdown commun à tous les objets structurés, checkboxes interactives mais sans logique métier ;
- création contextuelle rapide ; autosave ; Undo léger ; Trash restaurable ;
- online-first, aucune perte silencieuse ;
- mono-utilisateur strict, un seul espace, aucune inscription publique ni collaboration ;
- parité fonctionnelle mobile/desktop ; keyboard-first sur desktop sans dépendance au clavier sur mobile ;
- pas de notifications V1 ; uniquement des vues/badges internes.

---

## 37. Phrase produit de référence

> **Capturer immédiatement tout ce qui me passe par la tête, le clarifier avec le minimum de friction, le structurer seulement lorsque cela m’aide, puis faire émerger clairement ce sur quoi je dois agir.**
