// The mentor's card on the YouTube page: a note (such as the recall
// prompt), and when there is one, a multiple-choice question about what
// the learner just watched, with feedback on their answer.
//
// Rendered in a shadow root so YouTube's styles can't affect it (and it
// can't affect YouTube). All text is set with textContent, never as HTML.

import type {
  QuizQuestion,
  QuizResult
} from "../core/types";


const HOST_ID =
  "study-mentor-recall-prompt";

const AUTO_HIDE_MS =
  10 * 60_000;


export interface CardContent {

  nudgeId: string;

  message: string;

  // A question is on its way.
  loading?: boolean;

  quiz?: QuizQuestion;

}


export interface CardHandlers {

  // The learner closed the card without (or after) answering.
  onDismiss: (nudgeId: string) => void;

  // Grades the answer; null when it could not be graded.
  onAnswer: (
    quizId: string,
    chosenIndex: number
  ) => Promise<QuizResult | null>;

  // The learner chose to watch the relevant part again.
  onRewatch: (startS: number) => void;

}


let hideTimer:
  number | undefined;


export function hideMentorCard(): void {

  window.clearTimeout(hideTimer);

  document.getElementById(HOST_ID)?.remove();

}


function formatTime(
  totalSeconds: number
): string {

  const seconds =
    Math.max(0, Math.floor(totalSeconds));

  const hours =
    Math.floor(seconds / 3600);

  const minutes =
    Math.floor((seconds % 3600) / 60);

  const rest =
    String(seconds % 60).padStart(2, "0");

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;

}


const STYLES = `
  .card {
    width: 340px;
    max-height: 70vh;
    overflow-y: auto;
    box-sizing: border-box;
    padding: 16px;
    border-radius: 14px;
    border-left: 4px solid #6366f1;
    background: #ffffff;
    color: #172033;
    font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.3);
  }
  .label {
    margin-bottom: 6px;
    font-size: 12px;
    font-weight: 700;
    color: #6366f1;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  p { margin: 0 0 12px; }
  .muted { color: #6b7280; font-size: 13px; }
  .question { font-weight: 700; margin: 4px 0 10px; }
  .options { display: grid; gap: 8px; margin-bottom: 4px; }
  button {
    width: 100%;
    box-sizing: border-box;
    padding: 9px 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: #6366f1;
    color: #ffffff;
    font: inherit;
    font-weight: 600;
    text-align: center;
    cursor: pointer;
  }
  button:disabled { cursor: default; opacity: 0.85; }
  button.option {
    background: #f5f7fb;
    color: #172033;
    border-color: #d6dbe6;
    font-weight: 500;
    text-align: left;
  }
  button.option:hover:not(:disabled) { border-color: #6366f1; }
  button.option.right { background: #dcfce7; border-color: #16a34a; }
  button.option.wrong { background: #fee2e2; border-color: #dc2626; }
  button.ghost { background: transparent; color: #6366f1; border-color: #c7c9f5; margin-top: 8px; }
  .verdict { font-weight: 700; margin: 12px 0 6px; }
  .verdict.right { color: #15803d; }
  .verdict.wrong { color: #b91c1c; }
  .explanation { margin: 0 0 12px; }
`;


export function showMentorCard(
  content: CardContent,
  handlers: CardHandlers
): void {

  hideMentorCard();


  const host =
    document.createElement("div");

  host.id =
    HOST_ID;

  host.style.cssText =
    "position:fixed;right:20px;bottom:90px;z-index:2147483647;";


  const root =
    host.attachShadow({ mode: "closed" });


  const style =
    document.createElement("style");

  style.textContent =
    STYLES;


  const card =
    document.createElement("div");

  card.className =
    "card";

  card.setAttribute("role", "dialog");

  card.setAttribute("aria-label", "Study Mentor");


  root.append(style, card);


  function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string
  ): HTMLElementTagNameMap[K] {

    const created =
      document.createElement(tag);

    if (className) {

      created.className =
        className;

    }

    if (text !== undefined) {

      created.textContent =
        text;

    }

    return created;

  }


  function close(): void {

    hideMentorCard();

    handlers.onDismiss(content.nudgeId);

  }


  function addHeader(): void {

    card.append(
      element("div", "label", "Study Mentor"),
      element("p", "", content.message)
    );

  }


  function renderNote(
    loading: boolean
  ): void {

    card.replaceChildren();

    addHeader();

    if (loading) {

      card.append(
        element("p", "muted", "Thinking of a question about what you just watched...")
      );

      return;

    }

    const done =
      element("button", "", "Got it");

    done.addEventListener("click", close);

    card.append(done);

  }


  function renderResult(
    quiz: QuizQuestion,
    result: QuizResult
  ): void {

    const options =
      card.querySelectorAll<HTMLButtonElement>("button.option");

    options.forEach((button, index) => {

      button.disabled =
        true;

      if (index === result.correctIndex) {

        button.classList.add("right");

      } else if (index === result.chosenIndex) {

        button.classList.add("wrong");

      }

    });


    if (result.correct) {

      card.append(
        element("div", "verdict right", "Correct!"),
        element("p", "explanation", "Nice work. You understood that part.")
      );

      const next =
        element("button", "", "Continue watching");

      next.addEventListener("click", close);

      card.append(next);

      return;

    }


    card.append(
      element("div", "verdict wrong", "Not quite."),
      element(
        "p",
        "explanation",
        `The answer is "${quiz.options[result.correctIndex]}". ${result.explanation}`
      )
    );

    if (result.rewatch) {

      const rewatch =
        result.rewatch;

      const again =
        element(
          "button",
          "",
          `Watch this part again (from ${formatTime(rewatch.startS)})`
        );

      again.addEventListener("click", () => {

        hideMentorCard();

        handlers.onRewatch(rewatch.startS);

      });

      const skip =
        element("button", "ghost", "Continue without rewatching");

      skip.addEventListener("click", close);

      card.append(again, skip);

      return;

    }

    const next =
      element("button", "", "Continue watching");

    next.addEventListener("click", close);

    card.append(next);

  }


  function renderQuiz(
    quiz: QuizQuestion
  ): void {

    card.replaceChildren();

    addHeader();

    card.append(
      element("div", "question", quiz.question)
    );

    if (!quiz.grounded) {

      card.append(
        element("p", "muted", "This question is about the video's topic, as no transcript was available.")
      );

    }

    const list =
      element("div", "options");

    quiz.options.forEach((option, index) => {

      const button =
        element("button", "option", option);

      button.addEventListener("click", async () => {

        list
          .querySelectorAll("button")
          .forEach(other => {

            (other as HTMLButtonElement).disabled =
              true;

          });

        const result =
          await handlers.onAnswer(quiz.id, index);

        if (!result) {

          // Could not be graded; let the learner carry on.
          card.append(
            element("p", "muted", "Sorry, that answer could not be checked right now.")
          );

          const next =
            element("button", "", "Continue watching");

          next.addEventListener("click", close);

          card.append(next);

          return;

        }

        renderResult(quiz, result);

      });

      list.append(button);

    });

    card.append(list);

  }


  if (content.quiz) {

    renderQuiz(content.quiz);

  } else {

    renderNote(Boolean(content.loading));

  }


  document.body.appendChild(host);


  hideTimer =
    window.setTimeout(
      hideMentorCard,
      AUTO_HIDE_MS
    );

}
