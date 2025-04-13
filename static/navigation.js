Dashboard.setupQuestionNavigation = function (currentQuestionId) {
  const questionDropdown = document.getElementById("questionDropdown");
  const currentIndex = Array.from(questionDropdown.options).findIndex(
    (option) => option.value === currentQuestionId.toString()
  );
  const totalQuestions = questionDropdown.options.length;

  const existingNav = document.querySelector(".question-nav");
  if (existingNav) existingNav.remove();

  const nav = document.createElement("div");
  nav.className = "question-nav";

  const controls = document.createElement("div");
  controls.className = "nav-controls";

  const prevButton = document.createElement("button");
  prevButton.className = "nav-prev";
  prevButton.innerHTML = '<i class="fas fa-chevron-left"></i>';
  prevButton.title = "Previous Question";
  prevButton.setAttribute("aria-label", "Previous Question");

  const progress = document.createElement("div");
  progress.className = "nav-progress";
  const count = document.createElement("span");
  count.className = "nav-count";
  count.textContent = `${currentIndex + 1} / ${totalQuestions}`;
  const progressBar = document.createElement("div");
  progressBar.className = "nav-progress-bar";
  const progressFill = document.createElement("div");
  progressFill.className = "nav-progress-fill";
  progressFill.style.width = `${((currentIndex + 1) / totalQuestions) * 100}%`;
  progressBar.appendChild(progressFill);
  progress.appendChild(count);
  progress.appendChild(progressBar);

  const nextButton = document.createElement("button");
  nextButton.className = "nav-next";
  nextButton.innerHTML = '<i class="fas fa-chevron-right"></i>';
  nextButton.title = "Next Question";
  nextButton.setAttribute("aria-label", "Next Question");

  if (currentIndex <= 0) prevButton.classList.add("nav-disabled");
  else
    prevButton.addEventListener("click", () => {
      questionDropdown.selectedIndex = currentIndex - 1;
      Dashboard.displayQuestionDetails(questionDropdown.value, true);
    });

  if (currentIndex >= totalQuestions - 1 || currentIndex === -1)
    nextButton.classList.add("nav-disabled");
  else
    nextButton.addEventListener("click", () => {
      questionDropdown.selectedIndex = currentIndex + 1;
      Dashboard.displayQuestionDetails(questionDropdown.value, true);
    });

  let touchStartX = 0;
  let touchEndX = 0;
  document.addEventListener(
    "touchstart",
    (e) => (touchStartX = e.changedTouches[0].screenX),
    { passive: true }
  );
  document.addEventListener(
    "touchend",
    (e) => {
      touchEndX = e.changedTouches[0].screenX;
      const minSwipeDistance = 50;
      const swipeDistance = touchEndX - touchStartX;
      if (Math.abs(swipeDistance) > minSwipeDistance) {
        if (swipeDistance > 0 && !prevButton.classList.contains("nav-disabled"))
          prevButton.click();
        else if (
          swipeDistance < 0 &&
          !nextButton.classList.contains("nav-disabled")
        )
          nextButton.click();
      }
    },
    { passive: true }
  );

  controls.appendChild(prevButton);
  controls.appendChild(progress);
  controls.appendChild(nextButton);
  nav.appendChild(controls);
  document.body.appendChild(nav);
};
