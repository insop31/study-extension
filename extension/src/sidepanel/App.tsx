import { useEffect, useState } from "react";


interface StudyContext {

  title: string;

  url: string;

  website: string;

  timestamp: number;

  tabId?: number;
}


function App() {

  const [
    context,
    setContext
  ] = useState<StudyContext | null>(null);


  const [
    mentorMessage,
    setMentorMessage
  ] = useState(
    "I'm watching your study session. I'll give you a nudge when it might help."
  );


  useEffect(() => {

    chrome.runtime.sendMessage(
      {
        type: "GET_CURRENT_CONTEXT"
      },

      (response: StudyContext | null) => {

        if (response) {

          setContext(response);

        }

      }
    );

  }, []);


  function requestHint() {

    setMentorMessage(
      "💡 Hint: Before looking at the solution, try breaking the problem into smaller parts."
    );

  }


  return (

    <div className="app">

      <header className="header">

        <div>

          <h1>
            🧠 Study Mentor
          </h1>

          <p>
            Your personal AI learning companion
          </p>

        </div>

      </header>


      <section className="card">

        <h2>
          Current Activity
        </h2>


        {context ? (

          <>

            <div className="activity">

              <span className="label">
                Website
              </span>

              <span>
                {context.website}
              </span>

            </div>


            <div className="activity">

              <span className="label">
                Page
              </span>

              <span>
                {context.title}
              </span>

            </div>


          </>

        ) : (

          <p className="muted">
            Open a study website to begin.
          </p>

        )}

      </section>


      <section className="card mentor-card">

        <div className="mentor-title">

          <span>
            💡
          </span>

          <h2>
            Mentor
          </h2>

        </div>


        <p>
          {mentorMessage}
        </p>


        <button onClick={requestHint}>
          Give me a hint
        </button>

      </section>


      <section className="card">

        <h2>
          Today's Progress
        </h2>


        <div className="progress-container">

          <div className="progress-bar">

            <div className="progress-fill" />

          </div>

          <span>
            30%
          </span>

        </div>


        <p className="muted">

          Keep going. Consistency matters more
          than long sessions.

        </p>

      </section>

    </div>

  );
}


export default App;