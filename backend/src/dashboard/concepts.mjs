// The one idea worth having in mind before starting on a topic. Shown as a
// concept reminder when the learner opens a problem, video or page on a
// topic they find hard. Keys are canonical topic names (see metrics.mjs).

export const KEY_IDEAS = {
  "Arrays": "Index access is O(1); most array problems come down to one pass with the right extra variable, a second pointer, or a prefix sum.",
  "Strings": "Treat a string like an array of characters; counting characters with a hash map or a fixed 26-slot array solves many problems.",
  "Linked Lists": "Draw the pointers. A dummy head node and the fast/slow pointer trick handle most edge cases and cycle questions.",
  "Stacks & Queues": "A stack is last-in first-out (matching brackets, undo, monotonic stack for 'next greater'); a queue is first-in first-out (BFS, scheduling).",
  "Hash Tables": "Trade memory for speed: store what you've seen so each later lookup is O(1) instead of another scan.",
  "Trees": "Most tree problems are recursion: decide what each node returns to its parent, then handle the empty-node base case.",
  "Binary Search": "Binary search works on any monotonic yes/no condition, not just sorted arrays. Be precise about your low/high bounds and when to stop.",
  "Graphs": "Model the problem as nodes and edges first, then choose: BFS for shortest steps, DFS for exploring or cycles, Dijkstra for weighted paths. Track visited nodes.",
  "Dynamic Programming": "Define the state (what a subproblem means), write the recurrence from smaller states, set base cases, then memoize or fill a table.",
  "Recursion": "Trust the recursive call on a smaller input; your job is the base case and how to combine the result.",
  "Backtracking": "Choose, explore, un-choose. Prune branches early when they can no longer lead to a valid answer.",
  "Greedy Algorithms": "A greedy choice must be provably safe. Sorting by the right key is usually the first step, and a counterexample quickly shows when greedy fails.",
  "Sorting": "Know the costs: O(n log n) comparison sorts, and that sorting first often turns a hard problem into a simple scan.",
  "Sliding Window": "Grow the right edge, shrink the left edge while the window breaks the rule, and update the answer at each valid window.",
  "Two Pointers": "Move two indexes toward or alongside each other on sorted data to avoid a nested loop.",
  "Heaps": "A heap gives the smallest (or largest) item in O(log n); use it for top-k, merging sorted lists, and scheduling.",
  "Tries": "A trie stores strings character by character so prefix lookups cost the length of the word, not the number of words.",
  "Bit Manipulation": "x & (x - 1) clears the lowest set bit, XOR cancels equal values, and shifts multiply or divide by powers of two.",
  "Time Complexity": "Count how the work grows with input size; drop constants and keep the biggest term.",
  "Object-Oriented Programming": "Encapsulation, inheritance and polymorphism: each class owns its data and exposes behaviour through methods.",
  "Databases": "Think in sets: filter rows with WHERE, combine tables with JOIN on keys, then GROUP BY to aggregate.",
  "Operating Systems": "Processes are isolated programs; threads share memory. The scheduler, memory manager and file system share the hardware between them.",
  "Computer Networks": "Data travels through layers: application (HTTP), transport (TCP/UDP), network (IP), link. Each layer adds its own header.",
  "System Design": "Start from requirements and scale, then the data model and API, then the bottlenecks: caching, sharding, queues.",
  "Machine Learning": "A model learns parameters that minimise a loss on training data; judge it on data it has not seen.",
  "Python": "Everything is an object; lists, dicts and sets cover most needs, and comprehensions keep loops short.",
  "JavaScript": "Functions are values and closures capture variables; async code runs through promises and the event loop.",
  "Java": "Everything lives in classes; know the core collections (ArrayList, HashMap, HashSet) and the difference between primitives and objects.",
  "C++": "Prefer the STL (vector, unordered_map, set) and pass large objects by reference to avoid copies.",
  "C Programming": "C gives you raw memory: variables have types and sizes, pointers hold addresses, and you manage memory yourself with malloc and free.",
  "Web Development": "HTML is structure, CSS is presentation, JavaScript is behaviour; the browser builds the DOM from the HTML and scripts change it.",
  "Git": "Commits are snapshots; branches are pointers to commits. Stage, commit, then push or merge.",
  "Calculus": "A derivative is an instantaneous rate of change; an integral accumulates a quantity. They undo each other.",
  "Linear Algebra": "Matrices are linear transformations; multiplying them composes transformations, and eigenvectors are the directions they only stretch.",
  "Probability": "Probability of an event = favourable outcomes / possible outcomes (when equally likely); for independent events multiply, for exclusive ones add.",
  "Statistics": "Describe data by its centre (mean, median) and spread (variance, standard deviation) before drawing conclusions.",
  "Discrete Mathematics": "Logic, sets, counting and graphs: prove statements step by step, often by induction or contradiction.",
  "Physics": "Start from the fundamental law (e.g. F = ma, energy conservation), draw the system, then write the equation for what you know.",
  "Chemistry": "Reactions rearrange atoms, never create them: balance equations by conserving atoms and charge.",
  "Biology": "Structure fits function: from molecules to cells to organisms, ask what each part is for."
};

export function keyIdea(topic) {
  return KEY_IDEAS[topic] ?? null;
}
