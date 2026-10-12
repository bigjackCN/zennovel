import type { CommandType, EffectOp, IssueCode, StagePosition, ValueType } from '@zennovel/core';

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

  dialog: {
    ok: 'OK',
    cancel: 'Cancel',
  },

  crash: {
    title: 'Something went wrong',
    body: 'ZenNovel hit an unexpected problem. Your work is saved up to your last change; reloading usually fixes this.',
    reload: 'Reload',
    details: 'Technical details',
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
    demo: {
      name: 'Cherry Blossom Hill (sample)',
      description: 'A short story with backgrounds, characters, choices and two endings',
    },
    blank: { name: 'Blank project', description: 'Start from a blank page' },
    loadFailed: (status: number) => `Could not load template (HTTP ${status})`,
    notAProject: "This isn't a ZenNovel project file",
    newerFormat: (version: number) =>
      `This project was made with a newer version of ZenNovel (format ${version}). Update ZenNovel to open it.`,
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
    saveFailed: 'Not saved — click to retry',
    saveFailedDetail: (reason: string) =>
      `Your latest changes could not be saved to this browser (${reason}). Browser storage may be full: export the project file to keep a copy, then delete projects you no longer need.`,
    exportProject: 'Export project file',
    sceneName: 'Scene name',
    startScene: 'Start scene',
    preview: 'Preview',
    appearance: 'Appearance',
    previewHint:
      'Click or press Space to continue; press ← (or scroll up after clicking the preview) to go back. Pick options with ↑ ↓ and Enter. The preview refreshes as you edit.',
    undo: 'Undo',
    redo: 'Redo',
    deleted: 'Deleted.',
    sectionsLabel: 'Project sections',
    sections: { story: 'Story', cast: 'Characters', variables: 'Variables', assets: 'Images' },
    changedElsewhere: 'This project was changed in another tab or window.',
    loadTheirs: 'Load that version',
    keepMine: 'Keep mine',
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
    goTo: 'Show me',
    messages: {
      noStartScene: () => 'No start scene is set',
      missingVariable: () => 'Uses a variable that does not exist',
      missingConditionVariable: () => 'A condition uses a variable that does not exist',
      variableTypeMismatch: (p: Params) =>
        `"${p?.variable}" is used in a way that doesn't fit its kind (number / yes-no / text)`,
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
    chooseVariable: '(choose a variable)',
    newCharacter: '+ New character…',
    newVariable: '+ New variable…',
    missingImage: '(missing image)',
    uploadImage: 'Upload image…',
    noExpressions: '(no pictures yet — add some under Characters)',
    yes: 'yes',
    no: 'no',
    andOr: '+ and / or',
    allOf: 'All of these are true',
    anyOf: 'Any of these is true',
    addCondition: '+ Add condition',
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
    playLine: '▶ From this line',
    playLineHint: 'Start at the card you are editing, with the background and characters above it already on stage',
    playScene: 'This scene',
    playFromStart: '⟲ From the start',
  },

  cast: {
    title: 'Characters',
    add: '+ New character',
    hint: 'Each character has a name colour and any number of pictures ("expressions"): happy, sad, surprised… Use them with "Show character".',
    empty: 'No characters yet. Add one to give lines a speaker and put people on stage.',
    newPrompt: 'Name the new character:',
    defaultName: (n: number) => `Character ${n}`,
    name: 'Name',
    color: 'Name colour',
    usedIn: (n: number) => `used in ${plural(n, 'place', 'places')}`,
    unused: 'not used yet',
    delete: 'Delete',
    deleteConfirm: (name: string, uses: number) =>
      uses
        ? `Delete "${name}"? They appear in ${plural(uses, 'place', 'places')}; the story check will point those out.`
        : `Delete "${name}"?`,
    image: 'Picture',
    noImage: '(no picture)',
    expressionName: 'Expression name',
    nameTaken: 'That name is empty or already used',
    defaultExpression: 'normal',
    addExpression: 'Add picture',
    removeExpression: 'Remove this expression',
  },

  variables: {
    title: 'Variables',
    add: '+ New variable',
    hint: 'Variables remember things about the playthrough: affection points, whether the key was found, a chosen name. Choices change them; "If / else" and option conditions read them.',
    empty: 'No variables yet.',
    newPrompt: 'Name the new variable:',
    defaultName: (n: number) => `Variable ${n}`,
    name: 'Name',
    type: 'Kind',
    types: { number: 'Number', boolean: 'Yes / no', string: 'Text' } as Record<ValueType, string>,
    initial: 'Starts as',
    usedIn: (n: number) => `used in ${plural(n, 'place', 'places')}`,
    unused: 'not used yet',
    delete: 'Delete',
    deleteConfirm: (name: string, uses: number) =>
      uses
        ? `Delete "${name}"? It is used in ${plural(uses, 'place', 'places')}; the story check will point those out.`
        : `Delete "${name}"?`,
  },

  assets: {
    title: 'Images',
    upload: '+ Upload images',
    hint: (mb: string) =>
      `Backgrounds and character pictures. Images are stored inside the project, so an exported file contains everything. Drag files here to add them. Project size: about ${mb} MB.`,
    empty: 'No images yet. Upload backgrounds and character pictures, or drop files here.',
    name: 'Image name',
    usedIn: (n: number) => `used in ${plural(n, 'place', 'places')}`,
    unused: 'not used',
    replace: 'Replace',
    delete: 'Delete',
    deleteConfirm: (name: string, uses: number) =>
      uses ? `Delete "${name}"? It is used in ${plural(uses, 'place', 'places')}.` : `Delete "${name}"?`,
    notImage: (name: string) => `"${name}" is not an image.`,
    tooLarge: (name: string, mb: number) => `"${name}" is too large (${mb} MB). Please use images under 8 MB.`,
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
