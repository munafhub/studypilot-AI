# Demo script (3-4 minutes)

Record your screen while following these steps (any screen recorder works).

1. **Start** – `npm run seed && npm run dev`, open http://localhost:5173. Mention the banner if running without an API key.
2. **Register** a new account (or log in as `demo@studypilot.test` / `demo12345`). Show that a wrong password gives a generic error.
3. **Tasks** – add a task, edit it, tick it complete, delete one. Show the validation message by saving an empty title.
4. **Settings** – set Monday to 30 minutes and Saturday to 180 to show how availability shapes the plan.
5. **Syllabus** – run `npm run sample-pdf --workspace server`, upload `server/sample-syllabus.pdf`. In the review table fix a title, change a date, untick one row, press *Save*. Then upload a non-PDF file to show the error message.
6. **Planner** – choose *Next 7 days* → *Generate plan*. Point out the *draft · not saved yet* label and the warnings. Remove one session, then *Approve & save*.
7. **Progress** – tick a session on the Planner/Dashboard and show the progress bar update.
8. **Missed sessions** – (to simulate, on a plan whose days have passed, or mark a session *missed* via the API) press *Revise*. Show the three columns *Missed / Removed / Added*, then *Discard* once to show the saved plan is unchanged, revise again and *Approve*.
9. **Learn** – type a topic, *Explain this topic*, then *Quiz me* and answer the questions to see scoring.
10. **Security** – open a second account and show it cannot see the first account's tasks (404 from the API).
11. **Tests** – run `npm run test:coverage` and show the report.
