const stories = {
  mukunda: {title: 'Mukunda', eyebrow: 'Curiosity, rhythm & listening', paragraphs: ['Energetic and adventurous, Mukunda is often the first to move toward a mystery. He carries a madal, and gradually discovers that listening can be as powerful as taking action.', 'Near a broken connection, the drum may echo a rhythm he did not mean to play. Each mystery has its own sound; when the children restore what was lost, the unfinished rhythm becomes whole.']},
  maya: {title: 'Maya', eyebrow: 'Observation, memory & patterns', paragraphs: ['Maya is thoughtful, practical, and observant. She notices the little things and connects clues that others might pass by.', 'Her Spiral Journal preserves drawings, places, songs, rhythms, and the stories Aama shares. It never supplies an answer. It helps Maya remember, recognize patterns, and carry their discoveries into the next adventure.']},
  pintu: {title: 'Pintu', eyebrow: 'Instinct & a little mischief', paragraphs: ['Pintu is the group’s funny animal companion. A flick of his ear or an unexpected reaction can point the children toward a change they have not yet noticed.', 'He discovers clues through instinct and brings a comic beat to their adventures. He does not need to speak to help the children listen to their world.']},
  aama: {title: 'Aama', eyebrow: 'The keeper of human memory', paragraphs: ['Aama carries family stories, old songs, sayings, place names, and memories passed from one generation to the next.', 'She does not solve the children’s mysteries for them. A story she remembers can reveal the missing history behind a present-day problem, helping Mukunda, Maya, and Pintu understand what needs care.']},
  bhumi: {title: 'Bhumi', eyebrow: 'A guide who is already listening', paragraphs: ['Playful, compassionate, and mysterious, Bhumi is the bridge between the children and the deeper presence of the forest. He may be noticed in a breeze, a moving leaf, a bird, or a reflection.', 'Bhumi offers small signs and gentle guidance. The children still have to understand and repair the connection themselves. He is a guide, distinct from the greater, mostly unseen Forest Spirit.']},
  jhorle: {title: 'Jhorle', eyebrow: 'Episode 01 · Pilot story concept', paragraphs: ['Mukunda and Maya hear Aama greet someone with “Jhorle.” She explains that a greeting can be a way of seeing, respecting, and welcoming another presence. Mukunda begins greeting everyone—even Pintu and the trees.', 'Later, Pintu leads the children into an unfamiliar part of the forest. The world becomes strangely quiet. A broken spiral signals that something nearby has been forgotten.', 'Maya remembers Aama’s lesson. She quietly acknowledges the forest, and a small sign answers. Together, the children experience their first encounter with Bhumi: the playful guide who listened back.', 'The pilot’s proposed mystery follows a neglected spring or forgotten path. By learning its history and helping the community care for the place again, the children begin restoring a broken relationship.', 'The spiral becomes whole, natural sounds return, Mukunda’s rhythm resolves, and Maya records the first page of what will become the Spiral Journal.'], note: 'This is a story preview from the series bible. The pilot is in development.'}
};

const dialog = document.querySelector('#story-dialog');
let storyTrigger;
document.querySelectorAll('[data-story]').forEach(button => button.addEventListener('click', () => {
  const story = stories[button.dataset.story];
  if (!story || !dialog) return;
  storyTrigger = button;
  document.querySelector('#dialog-title').textContent = story.title;
  const body = document.querySelector('#dialog-body');
  body.replaceChildren();
  const eyebrow = document.createElement('p');
  eyebrow.className = 'dialog-eyebrow'; eyebrow.textContent = story.eyebrow; body.append(eyebrow);
  for (const copy of story.paragraphs) { const paragraph = document.createElement('p'); paragraph.textContent = copy; body.append(paragraph); }
  if (story.note) { const note = document.createElement('p'); note.className = 'story-note'; note.textContent = story.note; body.append(note); }
  dialog.showModal(); document.body.style.overflow = 'hidden';
}));
document.querySelector('#close-dialog')?.addEventListener('click', () => dialog.close());
dialog?.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});
dialog?.addEventListener('close', () => { document.body.style.overflow = ''; storyTrigger?.focus({preventScroll:true}); });

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
if (!reducedMotion.matches && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('in-view'); observer.unobserve(entry.target); }
  }), {threshold: 0.12});
  document.querySelectorAll('[data-reveal]').forEach(element => observer.observe(element));
}


