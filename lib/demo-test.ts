import type { ExamDefinition, ExamGroup, ExamQuestion, Passage, Question, QuestionGroup } from '@/lib/types'

export const DEMO_TEST_TITLE = 'Đề Thi Mẫu IELTS Reading - Test 1 (40 Câu)'

export const DEMO_PASSAGES: Passage[] = [
  {
    id: 'demo-passage-1',
    title: 'Community Gardens and the Modern City',
    passage_part: 1,
    question_count: 13,
    is_test_only: true,
    time_limit: 20,
    created_at: '2026-01-01T00:00:00.000Z',
    content: `<h2>Community Gardens and the Modern City</h2>
      <p>In many cities, residents have little access to private outdoor space. Community gardens have become one practical response. A neighbourhood group may lease a vacant lot from the council and divide it into small plots. Where the ground is compacted or contaminated, gardeners build <strong>raised beds</strong> and fill them with clean soil. A shared shed stores tools, while a simple rota makes sure that common paths and taps are maintained.</p>
      <p>The value of these gardens extends beyond the food they produce. Flowering strips attract bees and other pollinators, and vegetation can cool streets during hot weather. Gardening also gives people regular exercise and a reason to meet neighbours they might otherwise never know. Some groups organise shared meals at the end of the growing season. They are not, however, a replacement for public parks: their plots are small and are usually managed by a defined group of members.</p>
      <p>Organisation matters as much as soil. Many gardens use a volunteer coordinator to welcome new members and settle disagreements over water or plot boundaries. Kitchen scraps from nearby homes and coffee grounds from local cafés are turned into compost. Extra vegetables are delivered to a neighbourhood food pantry rather than left to spoil. In dry months, rainwater tanks reduce pressure on the mains supply, although stored water must still be used carefully.</p>
      <p>Long-term projects tend to succeed when their paths are accessible, their rules are clear and residents share responsibility. A council lease may last five years before it is reviewed. The most successful gardens are not necessarily the most technologically advanced; they are the ones in which people feel that the space belongs to the whole neighbourhood.</p>`,
  },
  {
    id: 'demo-passage-2',
    title: 'Building a Digital Museum Collection',
    passage_part: 2,
    question_count: 13,
    is_test_only: true,
    time_limit: 20,
    created_at: '2026-01-01T00:01:00.000Z',
    content: `<h2>Building a Digital Museum Collection</h2>
      <p><strong>Section A — The audit.</strong> Before scanning begins, a museum team creates an inventory of the objects it holds. Staff record each catalogue number, the material an object is made from and any signs of damage. This audit helps conservators decide which objects need special handling and which can be digitised first. A digital project is therefore not simply a photography exercise; it begins with a careful account of the collection itself.</p>
      <p><strong>Section B — Image capture.</strong> Photographers work with conservators to choose lighting that reveals detail without exposing fragile objects to unnecessary heat. A colour reference card is included in the first image of each session so that later adjustments are consistent. Flat objects may need only one photograph, while a carved vessel can be photographed from several angles. For some three-dimensional objects, teams use photogrammetry: software combines many overlapping photographs to create a navigable model.</p>
      <p><strong>Section C — Description.</strong> A high-quality image is not useful to researchers if it cannot be found. Cataloguers add metadata, including names, dates, locations and relationships to other objects. Optical character recognition (OCR) can make printed labels searchable, but it often misreads faded type or handwriting. Specialists check uncertain results rather than assuming that automated text is correct. Shared vocabularies also help different museums describe similar objects in compatible ways.</p>
      <p><strong>Section D — Access and preservation.</strong> Putting a file online does not automatically make it open to everyone. Copyright, donor agreements and cultural sensitivities can limit what visitors may download. Museums therefore distinguish between a public viewing copy and a high-resolution preservation copy stored securely. Both files need regular checks, because storage devices can fail and formats can become obsolete. A digital collection is a continuing service, not a one-time upload.</p>`,
  },
  {
    id: 'demo-passage-3',
    title: 'Restoring Wetlands on Working Farms',
    passage_part: 3,
    question_count: 14,
    is_test_only: true,
    time_limit: 20,
    created_at: '2026-01-01T00:02:00.000Z',
    content: `<h2>Restoring Wetlands on Working Farms</h2>
      <p>Wetlands were once drained across many farming regions to create additional fields. Today, restoration projects are bringing some of these areas back. A wetland can slow surface runoff after heavy rain, store water temporarily and provide habitat for birds, amphibians and insects. Its value depends on the landscape around it, so a restored site is usually planned together with nearby fields, streams and drainage channels.</p>
      <p>The first stage is a survey of soil and water movement. Engineers and ecologists map the ground, inspect existing field drains and measure water levels through different seasons. This evidence helps them choose where to block or redirect a drain. If water is held in the wrong place, crops may be damaged; if it is released too quickly, the wetland will not provide much flood protection. Farmers are involved from the beginning because they understand how the land behaves during an ordinary working year.</p>
      <p>Planting locally native reeds and sedges can stabilise the soil and create shelter for wildlife. These plants also slow water and can trap some of the sediment and nutrients that would otherwise move downstream. Reducing fertiliser use near the wetland improves water quality further. Tall concrete walls are rarely a good substitute: they can move flood pressure elsewhere and offer little habitat. Instead, a chain of shallow wet areas may hold winter rainfall while keeping most fields available for production.</p>
      <p>Monitoring continues after construction. Teams measure water levels, inspect vegetation and survey bird species at the same points each year. The results reveal whether the site is developing as expected or needs changes. Farmers may receive compensation for land temporarily taken out of production, and many projects support low-intensity grazing once plants are established. A successful restoration is judged not by a single photograph but by evidence gathered over several seasons.</p>`,
  },
]

export type DemoQuestionSpec = {
  questionNumber: number
  questionText: string
  acceptedAnswers: string[]
  explanation: string
}

export type DemoGroupSpec = {
  id: string
  passagePart: 1 | 2 | 3
  groupOrder: number
  instruction: string
  questionCategory: string
  inputType: QuestionGroup['input_type']
  sharedOptions: string[] | null
  questions: DemoQuestionSpec[]
}

export const DEMO_GROUPS: DemoGroupSpec[] = [
  {
    id: 'demo-group-p1-match',
    passagePart: 1,
    groupOrder: 1,
    instruction: 'Choose the feature that matches each description. Select A–D.',
    questionCategory: 'Matching Features',
    inputType: 'combo_box',
    sharedOptions: ['A. Raised beds', 'B. Food pantry link', 'C. Flowering strips', 'D. Monthly rota'],
    questions: [
      { questionNumber: 1, questionText: 'Which feature is used when the original ground is unsuitable for planting?', acceptedAnswers: ['A'], explanation: 'Raised beds are filled with clean soil when the ground is compacted or contaminated.' },
      { questionNumber: 2, questionText: 'Which arrangement helps ensure that surplus vegetables are eaten?', acceptedAnswers: ['B'], explanation: 'Extra vegetables are delivered to a neighbourhood food pantry.' },
      { questionNumber: 3, questionText: 'Which planting is specifically intended to attract bees?', acceptedAnswers: ['C'], explanation: 'Flowering strips attract bees and other pollinators.' },
      { questionNumber: 4, questionText: 'Which system shares responsibility for common paths and taps?', acceptedAnswers: ['D'], explanation: 'A simple rota assigns maintenance responsibilities to members.' },
    ],
  },
  {
    id: 'demo-group-p1-select',
    passagePart: 1,
    groupOrder: 2,
    instruction: 'Choose TWO options for each question.',
    questionCategory: 'Multiple Choice · Select Two',
    inputType: 'check_box',
    sharedOptions: [
      'A. Cooler streets in hot weather',
      'B. More habitat for pollinators',
      'C. Guaranteed lower apartment rents',
      'D. Regular exercise for members',
      'E. A complete replacement for public parks',
      'F. Shared meals among neighbours',
      'G. Private parking for residents',
      'H. Careful water use in dry months',
    ],
    questions: [
      { questionNumber: 5, questionText: 'Which TWO environmental benefits are mentioned?', acceptedAnswers: ['A', 'B'], explanation: 'Vegetation can cool streets, and flowering strips provide food for pollinators.' },
      { questionNumber: 6, questionText: 'Which TWO social or personal benefits are described?', acceptedAnswers: ['D', 'F'], explanation: 'Gardening provides exercise, and some groups share meals.' },
      { questionNumber: 7, questionText: 'Which TWO practices help the garden use resources responsibly?', acceptedAnswers: ['B', 'H'], explanation: 'Pollinator planting supports local wildlife, while careful water use is emphasised during dry months.' },
      { questionNumber: 8, questionText: 'Which TWO features are presented as shared community activities?', acceptedAnswers: ['D', 'F'], explanation: 'Members garden for exercise and may organise shared meals.' },
    ],
  },
  {
    id: 'demo-group-p1-completion',
    passagePart: 1,
    groupOrder: 3,
    instruction: 'Complete each sentence with ONE answer. Three accepted spellings or equivalent phrases are provided for each answer.',
    questionCategory: 'Summary Completion',
    inputType: 'text_box',
    sharedOptions: null,
    questions: [
      { questionNumber: 9, questionText: 'A council lease for a garden may be reviewed after ___ years.', acceptedAnswers: ['five years', '5 years', 'five'], explanation: 'The passage states that a council lease may last five years before review.' },
      { questionNumber: 10, questionText: 'Local cafés contribute used ___ to the compost.', acceptedAnswers: ['coffee grounds', 'used coffee', 'coffee'], explanation: 'Coffee grounds from nearby cafés are added to the compost.' },
      { questionNumber: 11, questionText: 'Extra vegetables are sent to a neighbourhood food ___.', acceptedAnswers: ['pantry', 'food pantry', 'neighbourhood pantry'], explanation: 'The surplus produce is delivered to a neighbourhood food pantry.' },
      { questionNumber: 12, questionText: 'Tanks collect ___ to reduce use of the mains supply.', acceptedAnswers: ['rainwater', 'rain water', 'collected rainwater'], explanation: 'Rainwater tanks reduce pressure on the mains supply.' },
      { questionNumber: 13, questionText: 'A volunteer ___ welcomes members and helps settle disagreements.', acceptedAnswers: ['coordinator', 'volunteer coordinator', 'garden coordinator'], explanation: 'A volunteer coordinator welcomes members and helps resolve disputes.' },
    ],
  },
  {
    id: 'demo-group-p2-match',
    passagePart: 2,
    groupOrder: 1,
    instruction: 'Choose the section that contains each piece of information. Select A–D.',
    questionCategory: 'Matching Information',
    inputType: 'combo_box',
    sharedOptions: ['A. The audit', 'B. Image capture', 'C. Description', 'D. Access and preservation'],
    questions: [
      { questionNumber: 14, questionText: 'An inventory records an object’s catalogue number and condition.', acceptedAnswers: ['A'], explanation: 'The audit records catalogue numbers, materials and signs of damage.' },
      { questionNumber: 15, questionText: 'A reference card is used to keep image colour consistent.', acceptedAnswers: ['B'], explanation: 'A colour reference card supports consistent image adjustments.' },
      { questionNumber: 16, questionText: 'Automated text from labels is checked by specialists.', acceptedAnswers: ['C'], explanation: 'Specialists review uncertain OCR results.' },
      { questionNumber: 17, questionText: 'Online availability does not necessarily mean visitors can download a file.', acceptedAnswers: ['D'], explanation: 'Copyright and other agreements can limit downloads.' },
      { questionNumber: 18, questionText: 'Several photographs can be combined to make a three-dimensional model.', acceptedAnswers: ['B'], explanation: 'Photogrammetry combines overlapping photographs to create a model.' },
      { questionNumber: 19, questionText: 'Stored files need checks because devices and formats can fail or age.', acceptedAnswers: ['D'], explanation: 'The preservation section describes ongoing checks of storage devices and formats.' },
    ],
  },
  {
    id: 'demo-group-p2-completion',
    passagePart: 2,
    groupOrder: 2,
    instruction: 'Complete each sentence with ONE word or short phrase.',
    questionCategory: 'Sentence Completion',
    inputType: 'text_box',
    sharedOptions: null,
    questions: [
      { questionNumber: 20, questionText: 'The first stage of a digitisation project is an ___.', acceptedAnswers: ['audit', 'inventory', 'collection audit'], explanation: 'The project begins with an audit that creates an inventory.' },
      { questionNumber: 21, questionText: 'A process that builds a 3D model from photographs is called ___.', acceptedAnswers: ['photogrammetry', 'photo-grammetry', 'image-based modelling'], explanation: 'Photogrammetry combines overlapping photographs into a navigable model.' },
      { questionNumber: 22, questionText: 'Cataloguers add descriptive information known as ___.', acceptedAnswers: ['metadata', 'catalogue metadata', 'descriptive metadata'], explanation: 'Names, dates and relationships are added as metadata.' },
      { questionNumber: 23, questionText: 'OCR can make printed labels searchable, but it may misread faded type or ___.', acceptedAnswers: ['handwriting', 'handwritten text', 'handwritten labels'], explanation: 'The passage warns that OCR often misreads handwriting.' },
      { questionNumber: 24, questionText: 'The secure high-resolution file is kept as a preservation ___.', acceptedAnswers: ['copy', 'preservation copy', 'master copy'], explanation: 'Museums distinguish a public viewing copy from a high-resolution preservation copy.' },
      { questionNumber: 25, questionText: 'A visitor’s ability to download an object may depend on copyright or a donor ___.', acceptedAnswers: ['agreement', 'donor agreement', 'agreement with donors'], explanation: 'Donor agreements can limit what visitors may download.' },
      { questionNumber: 26, questionText: 'A digital collection is described as a continuing ___.', acceptedAnswers: ['service', 'ongoing service', 'continuing service'], explanation: 'The final sentence says a digital collection is a continuing service.' },
    ],
  },
  {
    id: 'demo-group-p3-select',
    passagePart: 3,
    groupOrder: 1,
    instruction: 'Choose TWO options for each question.',
    questionCategory: 'Multiple Choice · Select Two',
    inputType: 'check_box',
    sharedOptions: [
      'A. Retain winter rainfall on the site',
      'B. Reduce fertiliser use near the wetland',
      'C. Plant locally native reeds and sedges',
      'D. Build tall concrete walls',
      'E. Measure water levels over time',
      'F. Survey bird species each year',
      'G. Widen field drains to release water quickly',
    ],
    questions: [
      { questionNumber: 27, questionText: 'Which TWO actions can improve water quality?', acceptedAnswers: ['B', 'C'], explanation: 'Reducing fertiliser and planting native vegetation can limit nutrients and sediment moving downstream.' },
      { questionNumber: 28, questionText: 'Which TWO activities help teams monitor ecological change?', acceptedAnswers: ['E', 'F'], explanation: 'Teams measure water levels and survey bird species at regular points.' },
      { questionNumber: 29, questionText: 'Which TWO approaches are consistent with natural flood protection?', acceptedAnswers: ['A', 'C'], explanation: 'Shallow wet areas can hold winter rainfall, and native plants slow water.' },
      { questionNumber: 30, questionText: 'Which TWO actions provide evidence about the site over several seasons?', acceptedAnswers: ['E', 'F'], explanation: 'Repeated measurements of water levels and bird surveys provide long-term evidence.' },
    ],
  },
  {
    id: 'demo-group-p3-completion',
    passagePart: 3,
    groupOrder: 2,
    instruction: 'Complete each sentence with ONE word or short phrase. Three accepted answers are provided for each item.',
    questionCategory: 'Sentence Completion',
    inputType: 'text_box',
    sharedOptions: null,
    questions: [
      { questionNumber: 31, questionText: 'A wetland can slow surface ___ after heavy rain.', acceptedAnswers: ['runoff', 'surface runoff', 'rainwater runoff'], explanation: 'Wetlands slow surface runoff after heavy rain.' },
      { questionNumber: 32, questionText: 'A survey maps soil and the movement of ___.', acceptedAnswers: ['water', 'water movement', 'groundwater'], explanation: 'The initial survey examines soil and water movement.' },
      { questionNumber: 33, questionText: 'Existing field ___ are inspected before a drain is changed.', acceptedAnswers: ['drains', 'field drains', 'drainage channels'], explanation: 'The team inspects field drains and measures water levels.' },
      { questionNumber: 34, questionText: 'Native plants can trap sediment and ___.', acceptedAnswers: ['nutrients', 'plant nutrients', 'fertiliser nutrients'], explanation: 'Reeds and sedges can trap sediment and nutrients.' },
      { questionNumber: 35, questionText: 'Tall concrete walls may transfer flood ___ to another place.', acceptedAnswers: ['pressure', 'flood pressure', 'water pressure'], explanation: 'Concrete walls can move flood pressure elsewhere.' },
      { questionNumber: 36, questionText: 'Teams record water levels at the same points each ___.', acceptedAnswers: ['year', 'each year', 'annually'], explanation: 'Water levels are measured at the same points each year.' },
      { questionNumber: 37, questionText: 'Farmers may receive ___ for land taken out of production.', acceptedAnswers: ['compensation', 'financial compensation', 'payment'], explanation: 'The passage states that farmers may receive compensation.' },
      { questionNumber: 38, questionText: 'Some sites allow ___ grazing after plants are established.', acceptedAnswers: ['low-intensity', 'low intensity', 'light'], explanation: 'Low-intensity grazing may be supported once plants are established.' },
      { questionNumber: 39, questionText: 'Restoration is assessed using evidence from several ___.', acceptedAnswers: ['seasons', 'growing seasons', 'years'], explanation: 'Success is judged from evidence gathered over several seasons.' },
      { questionNumber: 40, questionText: 'A repeated survey of ___ helps track wildlife change.', acceptedAnswers: ['bird species', 'birds', 'bird populations'], explanation: 'Bird species are surveyed at the same points each year.' },
    ],
  },
]

export const DEMO_TEST_CARD = {
  id: 'demo-test-1',
  title: DEMO_TEST_TITLE,
  passage_1_id: DEMO_PASSAGES[0].id,
  passage_2_id: DEMO_PASSAGES[1].id,
  passage_3_id: DEMO_PASSAGES[2].id,
  created_at: '2026-01-01T00:00:00.000Z',
  isDemo: true,
}

function toPassageGroup(groupSpec: DemoGroupSpec): ExamGroup {
  const passage = DEMO_PASSAGES.find((item) => item.passage_part === groupSpec.passagePart)!
  const group: QuestionGroup = {
    id: groupSpec.id,
    passage_id: passage.id,
    group_order: groupSpec.groupOrder,
    instruction: groupSpec.instruction,
    question_category: groupSpec.questionCategory,
    input_type: groupSpec.inputType,
    shared_content: null,
    shared_options: groupSpec.sharedOptions,
  }
  const questions: Question[] = groupSpec.questions.map((question) => ({
    id: `demo-question-${question.questionNumber}`,
    passage_id: passage.id,
    group_id: group.id,
    question_number: question.questionNumber,
    question_text: question.questionText,
    options: null,
    accepted_answers: question.acceptedAnswers,
    explanation: question.explanation,
  }))
  return { ...group, questions }
}

export function buildDemoExamDefinition(isTimed: boolean): ExamDefinition {
  const totalQuestions = DEMO_GROUPS.reduce((total, group) => total + group.questions.length, 0)
  if (totalQuestions !== 40) throw new Error(`Demo test must contain 40 questions; found ${totalQuestions}.`)

  const groups = DEMO_GROUPS.map(toPassageGroup)
  const passageById = new Map(DEMO_PASSAGES.map((passage) => [passage.id, passage]))
  const questions: ExamQuestion[] = groups.flatMap((group) => {
    const passage = passageById.get(group.passage_id)!
    return group.questions.map((question) => ({
      ...question,
      question_category: group.question_category,
      input_type: group.input_type,
      passage_part: passage.passage_part,
      passage_title: passage.title,
    }))
  }).sort((a, b) => a.question_number - b.question_number)

  return {
    id: 'demo-exam-session',
    title: DEMO_TEST_TITLE,
    mode: 'test',
    testId: null,
    isTimed,
    isDemo: true,
    passages: DEMO_PASSAGES,
    groups,
    questions,
  }
}
