import { quizPersonalization } from "../dashboard/personalize.mjs";

// Stores quiz questions and grades answers. The correct answer and the
// explanation stay on the server until the learner has answered.

function toResult(row) {
  return {
    correct: row.correct,
    chosenIndex: row.chosen_index,
    correctIndex: row.correct_index,
    explanation: row.explanation,
    concept: row.concept,
    // Only a wrong answer is sent back to part of the video.
    rewatch: row.correct
      ? null
      : { startS: Math.floor(row.segment_start_s), endS: Math.floor(row.segment_end_s) }
  };
}

export function createQuizService(pool, generateQuiz, now = () => new Date(), profiles = null) {

  async function latestWatch(userId, videoId) {
    const { rows } = await pool.query(
      `SELECT w.*
       FROM video_watches w
       JOIN study_sessions s ON s.id = w.session_id
       WHERE w.user_id = $1 AND w.video_id = $2
       ORDER BY s.start_time DESC LIMIT 1`,
      [userId, videoId]
    );
    return rows[0] ?? null;
  }

  // Returns { quiz } with no answer in it, or { error, status }.
  async function create(userId, { videoId, nudgeId, positionS, excerpt }) {
    if (!generateQuiz) {
      return { status: 503, error: "Quiz questions are not configured on the server." };
    }

    const watch = await latestWatch(userId, videoId);
    if (!watch) {
      return { status: 404, error: "Watch the video for a moment before asking for a question." };
    }

    // Pitch the question at this learner, revisit what they got wrong, and
    // don't repeat questions already asked on this video.
    let personalization = null;
    if (profiles) {
      const { rows: asked } = await pool.query(
        `SELECT question FROM video_quizzes
         WHERE user_id = $1 AND video_id = $2
         ORDER BY created_at DESC LIMIT 5`,
        [userId, videoId]
      );
      const profile = await profiles.get(userId, { topics: watch.topics });
      personalization = quizPersonalization(profile, asked.map(r => r.question));
    }

    const generated = await generateQuiz({
      video: {
        title: watch.title,
        channel: watch.channel,
        topics: watch.topics
      },
      excerpt: excerpt ?? null,
      positionS,
      personalization
    });

    if (!generated.success) {
      return { status: 502, error: generated.error };
    }

    const q = generated.quiz;

    // Only link a nudge that belongs to this learner.
    let linkedNudge = null;
    if (nudgeId) {
      const { rows } = await pool.query(
        "SELECT id FROM mentor_interactions WHERE id = $1 AND user_id = $2",
        [nudgeId, userId]
      );
      linkedNudge = rows[0]?.id ?? null;
    }

    const { rows: [row] } = await pool.query(
      `INSERT INTO video_quizzes
         (user_id, session_id, video_id, nudge_id, question, options, correct_index,
          explanation, concept, position_s, segment_start_s, segment_end_s, grounded, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        userId, watch.session_id, videoId, linkedNudge, q.question, q.options,
        q.correctIndex, q.explanation, q.concept, positionS,
        q.rewatch.startS, q.rewatch.endS, q.grounded, now()
      ]
    );

    return {
      quiz: {
        id: row.id,
        question: q.question,
        options: q.options,
        grounded: q.grounded,
        concept: q.concept
      }
    };
  }

  async function answer(userId, quizId, chosenIndex) {
    const { rows: [quiz] } = await pool.query(
      "SELECT * FROM video_quizzes WHERE id = $1 AND user_id = $2",
      [quizId, userId]
    );
    if (!quiz) return { status: 404, error: "Question not found." };

    if (chosenIndex >= quiz.options.length) {
      return { status: 400, error: "That is not one of the options." };
    }

    // The first answer counts; asking again returns the same result.
    if (quiz.answered_at) return { result: toResult(quiz) };

    const { rows: [graded] } = await pool.query(
      `UPDATE video_quizzes
       SET answered_at = $2, chosen_index = $3, correct = ($3 = correct_index)
       WHERE id = $1 AND answered_at IS NULL
       RETURNING *`,
      [quizId, now(), chosenIndex]
    );

    if (quiz.nudge_id) {
      await pool.query(
        `UPDATE mentor_interactions SET user_response = 'answered'
         WHERE id = $1 AND user_response IS NULL`,
        [quiz.nudge_id]
      );
    }

    profiles?.invalidate(userId);

    return { result: toResult(graded ?? { ...quiz, answered_at: now() }) };
  }

  async function summaryForVideo(userId, videoId) {
    const { rows: [row] } = await pool.query(
      `SELECT count(*)::int AS asked,
              count(*) FILTER (WHERE answered_at IS NOT NULL)::int AS answered,
              count(*) FILTER (WHERE correct)::int AS correct
       FROM video_quizzes
       WHERE user_id = $1 AND video_id = $2
         AND session_id = (
           SELECT w.session_id FROM video_watches w
           JOIN study_sessions s ON s.id = w.session_id
           WHERE w.user_id = $1 AND w.video_id = $2
           ORDER BY s.start_time DESC LIMIT 1
         )`,
      [userId, videoId]
    );
    return row;
  }

  return { create, answer, summaryForVideo };
}
