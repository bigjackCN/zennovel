import type { CommandType, EffectOp, IssueCode, StagePosition } from '@zennovel/core';

type Params = Record<string, string> | undefined;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * English UI text. This object is the source of truth for the shape of
 * every other language: `zh.ts` must provide the same keys (enforced by
 * the `Messages` type), so a missing translation is a type error.
 */
export const en = {
  app: {
    tagline: 'Write stories, not code. A visual novel maker for writers.',
    language: 'Language',
  },

  home: {
    newStory: 'New story',
    importProject: 'Import project',
    importHint: 'Open a previously exported .json project file',
    myStories: 'My stories',
    empty: 'No projects yet. Try starting from the sample above.',
    namePrompt: 'Name your new story:',
    defaultName: 'My Story',
    deleteConfirm: (name: string) => `Delete "${name}"? This can't be undone.`,
    summary: (scenes: number, date: string) => `${plural(scenes, 'scene', 'scenes')} · edited ${date}`,
    export: 'Export',
    delete: 'Delete',
  },

  templates: {
    demo: { name: 'Cherry Blossom Hill (sample)', description: 'A short story with backgrounds, characters, choices and two endings' },
    blank: { name: 'Blank project', description: 'Start from a blank page' },
    loadFailed: (status: number) => `Could not load template (HTTP ${status})`,
    notAProject: "This isn't a ZenNovel project file",
  },

  newProject: {
    firstSceneName: 'Start',
    firstLine: 'The story begins here…',
  },

  editor: {
    loading: 'Loading…',
    notFound: "This project couldn't be found.",
    backToProjects: 'Back to projects',
    projects: '← Projects',
    projectName: 'Project name',
    saved: 'Saved',
    saving: 'Saving…',
    exportProject: 'Export project file',
    sceneName: 'Scene name',
    startScene: 'Start scene',
    preview: 'Preview',
    appearance: 'Appearance',
    previewHint: 'Click or press Space to continue; press ← or scroll up to go back. The preview refreshes as you edit.',
  },

  scenes: {
    title: 'Scenes',
    newScene: '+ New scene',
    newScenePrompt: 'Name the new scene:',
    defaultName: (n: number) => `Scene ${n}`,
    untitled: '(untitled)',
    errors: (n: number) => plural(n, 'error', 'errors'),
    warnings: (n: number) => plural(n, 'warning', 'warnings'),
    setAsStart: 'Set as start',
    delete: 'Delete',
    deleteConfirm: (name: string) => `Delete scene "${name}"?`,
  },

  issues: {
    title: 'Story check',
    none: '✓ No problems found',
    separator: ': ',
    messages: {
      noStartScene: () => 'No start scene is set',
      missingVariable: () => 'Uses a variable that does not exist',
      missingConditionVariable: () => 'A condition uses a variable that does not exist',
      missingBackground: () => 'The background image is missing',
      missingShowCharacter: () => 'The character to show does not exist',
      missingExpression: (p: Params) => `${p?.character} has no "${p?.expression}" expression`,
      missingHideCharacter: () => 'The character to hide does not exist',
      missingSpeaker: () => 'The speaking character does not exist',
      emptyLine: () => 'A line is empty',
      emptyChoice: () => 'A choice has no options',
      missingOptionTarget: (p: Params) => `Option "${p?.option}" points to a scene that does not exist`,
      missingJumpTarget: () => 'Jump target scene does not exist',
      noEnding: () => 'Scene has no jump or End at the end, so the story will stop here',
      unreachable: () => 'No path leads to this scene',
    } satisfies Record<IssueCode, (p: Params) => string> as Record<IssueCode, (p: Params) => string>,
  },

  commands: {
    labels: {
      say: 'Line',
      bg: 'Background',
      show: 'Show character',
      hide: 'Hide character',
      choice: 'Choice',
      jump: 'Jump',
      setVar: 'Variable',
      if: 'If / else',
      end: 'End',
    } as Record<CommandType, string>,
    add: 'Add:',
    emptyScene: 'This scene is empty. Add the first step below.',
    emptyBranch: '(empty)',
    moveUp: 'Move up',
    moveDown: 'Move down',
    delete: 'Delete',
  },

  card: {
    narrator: 'Narrator',
    linePlaceholder: 'Type a line. Enter for the next line, Shift+Enter for a line break.',
    solidColor: 'Solid color',
    fadeIn: 'Fade in',
    at: 'at',
    positions: { left: 'left', center: 'center', right: 'right' } as Record<StagePosition, string>,
    leavesStage: 'leaves the stage',
    goTo: 'Go to',
    if: 'If',
    then: 'Then:',
    otherwise: 'Otherwise:',
    storyEnds: 'The story ends here',
    chooseCharacter: '(choose a character)',
    chooseScene: '(choose a scene)',
    continueBelow: 'Continue below',
    noVariables: '(this project has no variables yet)',
    chooseVariable: '(choose a variable)',
    compoundCondition: '(combined condition: not editable here yet)',
    choicePrompt: 'Question text (optional), e.g. Where should we go?',
    removeOption: 'Remove this option',
    whenPicked: 'When picked:',
    remove: 'Remove',
    onlyShowIf: 'Only show if:',
    changeVariable: '+ Change a variable',
    showCondition: '+ Show condition',
    addOption: '+ Add option',
    newOption: 'New option',
    optionN: (n: number) => `Option ${n}`,
    effectOps: { add: 'add', subtract: 'subtract', set: 'set to', toggle: 'toggle' } as Record<EffectOp, string>,
  },

  preview: {
    playScene: '▶ Play this scene',
    playFromStart: '⟲ Play from start',
  },

  theme: {
    dialogueBox: 'Dialogue box',
    background: 'Background',
    opacity: 'Opacity',
    textColor: 'Text color',
    fontSize: 'Font size',
    cornerRadius: 'Corner radius',
    height: 'Height',
    text: 'Text',
    typingSpeed: 'Typing speed',
    instant: 'Instant',
    charsPerSec: (n: number) => `${n} chars/sec`,
    choiceButtons: 'Choice buttons',
    hoverColor: 'Hover color',
    reset: 'Reset to default',
    game: 'Game',
    gameLanguage: 'Player language',
    gameLanguageHint: 'Language of the player’s own buttons (e.g. “The End”). Your story text is not translated.',
  },
};

export type Messages = typeof en;
