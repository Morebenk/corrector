Dashboard.currentImagePage = 1;
Dashboard.currentQuestionForImage = null;
Dashboard.currentImageFile = null;
Dashboard.currentFileFilter = null;
Dashboard.availablePages = [];

Dashboard.openImageBrowser = async function (
  questionId,
  filePathFilter = null
) {
  console.log(
    "Opening image browser for question ID:",
    questionId,
    "File filter:",
    filePathFilter
  );
  Dashboard.currentQuestionForImage = questionId;
  Dashboard.currentFileFilter = filePathFilter;
  const imageBrowserModal = document.getElementById("imageBrowserModal");
  if (!imageBrowserModal) {
    console.error("Image browser modal not found");
    return;
  }
  imageBrowserModal.classList.add("active");
  document.body.style.overflow = "hidden";

  const imagesGrid = document.querySelector(".images-grid");
  if (!imagesGrid) {
    console.error("Images grid not found");
    imageBrowserModal.classList.remove("active");
    document.body.style.overflow = "";
    return;
  }
  imagesGrid.innerHTML =
    '<div class="loading-message">Loading question data...</div>';

  try {
    const response = await fetch(
      `/api/question/${questionId}${
        filePathFilter ? `?file_path=${encodeURIComponent(filePathFilter)}` : ""
      }`
    );
    if (!response.ok)
      throw new Error(`Server responded with ${response.status}`);
    const questionData = await response.json();

    let initialFile = null;
    let initialPage = null;
    let questionNumber = null;

    // Prioritize duplicate's file and page if filePathFilter is provided
    if (filePathFilter) {
      const location = questionData.file_locations.find(
        (loc) => loc.file_path === filePathFilter
      );
      if (location) {
        initialFile = location.file_path;
        initialPage = location.page;
        questionNumber = location.question_number;
        console.log(
          `Using filtered file: ${initialFile}, page: ${initialPage}, question number: ${questionNumber}`
        );
      } else {
        console.warn(
          `Filtered file ${filePathFilter} not found in file_locations:`,
          questionData.file_locations
        );
        // Instead of falling back, use the filtered file path directly
        initialFile = filePathFilter;
        // Fetch page and question number from representative as a fallback
        initialPage = questionData.representative_page;
        questionNumber = questionData.representative_question_number;
        console.log(
          `Using filePathFilter directly: ${initialFile}, fallback page: ${initialPage}, question number: ${questionNumber}`
        );
      }
    } else {
      // No filter provided, use representative
      initialFile = questionData.representative_file_path;
      initialPage = questionData.representative_page;
      questionNumber = questionData.representative_question_number;
      console.log(
        `Using representative file: ${initialFile}, page: ${initialPage}, question number: ${questionNumber}`
      );
    }

    if (!initialFile || !initialPage) {
      imagesGrid.innerHTML =
        '<div class="error-message">No page information available for this question</div>';
      return;
    }

    // Populate file dropdown with all file_locations
    const imageFileSelect = document.getElementById("imageFileSelect");
    if (!imageFileSelect) {
      console.error("Image file select not found");
      imagesGrid.innerHTML =
        '<div class="error-message">Image file selector not found</div>';
      return;
    }
    imageFileSelect.innerHTML = '<option value="">Select a file</option>';
    questionData.file_locations.forEach((loc) => {
      const option = document.createElement("option");
      option.value = loc.file_path;
      option.textContent = loc.file_path.split("/").pop();
      option.title = loc.file_path;
      if (loc.file_path === initialFile) option.selected = true;
      imageFileSelect.appendChild(option);
    });

    Dashboard.currentImageFile = initialFile;
    Dashboard.currentImagePage = initialPage;
    await Dashboard.loadImages(initialFile, initialPage, questionNumber);
    await Dashboard.loadAvailablePages(initialFile);
  } catch (err) {
    console.error("Error loading question data for image browser:", err);
    imagesGrid.innerHTML = `<div class="error-message">Error loading question data: ${err.message}</div>`;
  }

  const nav = document.querySelector(".question-nav");
  if (nav) nav.style.display = "none";
};

Dashboard.closeImageBrowser = function () {
  const imageBrowserModal = document.getElementById("imageBrowserModal");
  if (imageBrowserModal) {
    imageBrowserModal.classList.remove("active");
    document.body.style.overflow = "";
    const nav = document.querySelector(".question-nav");
    if (nav) nav.style.display = "flex";
  }
};

Dashboard.loadImageFiles = async function () {
  const imageFileSelect = document.getElementById("imageFileSelect");
  if (!imageFileSelect) {
    console.error("Image file select not found in loadImageFiles");
    return;
  }
  try {
    const response = await fetch("/api/image_files");
    if (!response.ok)
      throw new Error(`Failed to fetch image files: ${response.status}`);
    const data = await response.json();
    while (imageFileSelect.options.length > 1) imageFileSelect.remove(1);
    data.files.forEach((file) => {
      const option = document.createElement("option");
      option.value = file;
      option.textContent = file.split("/").pop();
      option.title = file;
      imageFileSelect.appendChild(option);
    });
  } catch (err) {
    console.error("Error loading image files:", err);
  }
};

Dashboard.loadAvailablePages = async function (filePath) {
  try {
    const response = await fetch(
      `/api/available_pages?file_path=${encodeURIComponent(filePath)}`
    );
    if (!response.ok)
      throw new Error(`Failed to fetch available pages: ${response.status}`);
    const data = await response.json();
    Dashboard.availablePages = data.pages || [];
    Dashboard.updatePageNavigation();
  } catch (err) {
    console.error("Error loading available pages:", err);
    Dashboard.availablePages = [];
    Dashboard.updatePageNavigation();
  }
};

Dashboard.loadImages = async function (file, pageNumber, questionNumber) {
  const imagesGrid = document.querySelector(".images-grid");
  if (!imagesGrid) return;
  imagesGrid.innerHTML = `<div class="loading-message">Loading images for page ${pageNumber}...</div>`;

  try {
    const url = `/api/page_images?file_path=${encodeURIComponent(
      file
    )}&page_number=${pageNumber}${
      questionNumber ? `&question_number=${questionNumber}` : ""
    }`;
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Server responded with ${response.status}`);
    const data = await response.json();

    const pageSelector = document.querySelector(".page-selector");
    if (pageSelector) {
      pageSelector.innerHTML = `
        <div class="page-nav">
          <button class="page-prev" ${
            Dashboard.availablePages.indexOf(pageNumber) <= 0 ? "disabled" : ""
          }>← Prev</button>
          <span class="page-info">Page ${pageNumber}${
        data.original_query_path && data.original_query_path !== file
          ? " (from filtered file)"
          : ""
      }</span>
          <button class="page-next" ${
            Dashboard.availablePages.indexOf(pageNumber) >=
            Dashboard.availablePages.length - 1
              ? "disabled"
              : ""
          }>Next →</button>
        </div>
      `;
      const prevBtn = pageSelector.querySelector(".page-prev");
      const nextBtn = pageSelector.querySelector(".page-next");
      if (prevBtn) {
        prevBtn.addEventListener("click", () => {
          const idx = Dashboard.availablePages.indexOf(pageNumber);
          if (idx > 0) {
            Dashboard.currentImagePage = Dashboard.availablePages[idx - 1];
            Dashboard.loadImages(
              file,
              Dashboard.currentImagePage,
              questionNumber
            );
          }
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener("click", () => {
          const idx = Dashboard.availablePages.indexOf(pageNumber);
          if (idx < Dashboard.availablePages.length - 1) {
            Dashboard.currentImagePage = Dashboard.availablePages[idx + 1];
            Dashboard.loadImages(
              file,
              Dashboard.currentImagePage,
              questionNumber
            );
          }
        });
      }
    }

    displayImageResults(data.images, questionNumber);
  } catch (err) {
    console.error("Error loading images:", err);
    imagesGrid.innerHTML = `<div class="error-message">Error loading images: ${err.message}</div>`;
  }
};

function displayImageResults(images, questionNumber) {
  const imagesGrid = document.querySelector(".images-grid");
  if (!imagesGrid) return;
  if (!images || images.length === 0) {
    imagesGrid.innerHTML =
      '<div class="error-message">No images found for this page</div>';
    return;
  }
  imagesGrid.innerHTML = "";
  images.forEach((image) => {
    const imgDiv = document.createElement("div");
    imgDiv.className = `image-item ${
      image.is_question_image ? "highlighted" : ""
    }`;
    const img = document.createElement("img");
    img.src = image.url;
    img.alt = `Image ${image.question_number || ""}`;
    img.loading = "lazy";
    imgDiv.addEventListener("click", () => Dashboard.showImagePreview(image));
    const infoDiv = document.createElement("div");
    infoDiv.className = "image-info";
    infoDiv.textContent = image.question_number
      ? `Question ${image.question_number}`
      : `Image ${image.id}`;
    const zoomContainer = document.createElement("div");
    zoomContainer.className = "zoom-container";
    zoomContainer.appendChild(img);
    const previewIcon = document.createElement("div");
    previewIcon.className = "preview-icon";
    previewIcon.innerHTML = '<i class="fas fa-search-plus"></i>';
    imgDiv.appendChild(zoomContainer);
    imgDiv.appendChild(previewIcon);
    imgDiv.appendChild(infoDiv);
    imagesGrid.appendChild(imgDiv);
  });
}

Dashboard.showImagePreview = async function (image) {
  const previewModal = document.getElementById("imagePreviewModal");
  if (!previewModal) {
    console.error("Preview modal not found");
    return;
  }
  const previewImage = document.getElementById("previewImage");
  previewImage.src = image.url;
  previewModal.style.display = "flex";
  document.body.style.overflow = "hidden";

  const selectBtn = previewModal.querySelector(".select-preview-image");
  const cancelBtn = previewModal.querySelector(".cancel-preview");
  const closeBtn = previewModal.querySelector(".close-preview");

  const closePreview = () => {
    previewModal.style.display = "none";
    document.body.style.overflow = "";
    const nav = document.querySelector(".question-nav");
    if (nav) nav.style.display = "flex";
  };

  selectBtn.onclick = async () => {
    if (!Dashboard.currentQuestionForImage) return;
    try {
      const response = await fetch(
        `/api/question/${Dashboard.currentQuestionForImage}/image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: image.url }),
        }
      );
      if (!response.ok)
        throw new Error(
          `Server responded with ${response.status}: ${await response.text()}`
        );
      const result = await response.json();
      if (result.status === "success") {
        localStorage.setItem(
          "lastImagePage",
          Dashboard.currentImagePage.toString()
        );
        localStorage.setItem(
          "lastImageFile",
          document.getElementById("imageFileSelect").value
        );
        Dashboard.displayQuestionDetails(Dashboard.currentQuestionForImage);
        closePreview();
        Dashboard.closeImageBrowser();
      } else {
        alert("Error setting image: " + (result.error || "Unknown error"));
      }
    } catch (err) {
      console.error("Error setting image:", err);
      alert("Error setting image: " + err.message);
    }
  };

  cancelBtn.onclick = closePreview;
  closeBtn.onclick = closePreview;

  document.addEventListener("keydown", function handler(e) {
    if (e.key === "Escape") {
      closePreview();
      document.removeEventListener("keydown", handler);
    } else if (e.key === "Enter" && selectBtn) {
      selectBtn.click();
      document.removeEventListener("keydown", handler);
    }
  });

  previewModal.addEventListener("click", function handler(e) {
    if (e.target === previewModal) {
      closePreview();
      previewModal.removeEventListener("click", handler);
    }
  });
};

Dashboard.updatePageNavigation = function () {
  const pageSelector = document.querySelector(".page-selector");
  if (!pageSelector) return;
  const pageNumber = Dashboard.currentImagePage;
  const prevBtn = pageSelector.querySelector(".page-prev");
  const nextBtn = pageSelector.querySelector(".page-next");
  if (prevBtn) {
    prevBtn.disabled = Dashboard.availablePages.indexOf(pageNumber) <= 0;
  }
  if (nextBtn) {
    nextBtn.disabled =
      Dashboard.availablePages.indexOf(pageNumber) >=
      Dashboard.availablePages.length - 1;
  }
};

// Event Listeners for Image Browser
document.addEventListener("DOMContentLoaded", () => {
  const imageFileSelect = document.getElementById("imageFileSelect");
  if (imageFileSelect) {
    imageFileSelect.addEventListener("change", async function () {
      if (this.value && Dashboard.currentQuestionForImage) {
        Dashboard.currentImageFile = this.value;
        try {
          const response = await fetch(
            `/api/question/${Dashboard.currentQuestionForImage}${
              Dashboard.currentFileFilter
                ? `?file_path=${encodeURIComponent(
                    Dashboard.currentFileFilter
                  )}`
                : ""
            }`
          );
          const questionData = await response.json();
          const location = questionData.file_locations.find(
            (loc) => loc.file_path === this.value
          );
          const pageToLoad = location
            ? location.page
            : questionData.representative_page;
          if (pageToLoad) {
            Dashboard.currentImagePage = pageToLoad;
            Dashboard.loadImages(
              this.value,
              pageToLoad,
              location
                ? location.question_number
                : questionData.representative_question_number
            );
            Dashboard.loadAvailablePages(this.value);
          } else {
            document.querySelector(".images-grid").innerHTML =
              '<div class="error-message">No page information for this file</div>';
          }
        } catch (err) {
          console.error("Error fetching question data:", err);
          document.querySelector(
            ".images-grid"
          ).innerHTML = `<div class="error-message">Error: ${err.message}</div>`;
        }
      } else if (!this.value) {
        document.querySelector(".images-grid").innerHTML =
          '<div class="select-file-message">Please select a file</div>';
      }
    });
  } else {
    console.warn("imageFileSelect not found on DOM load");
  }

  const closeModal = document.querySelector(".close-modal");
  if (closeModal)
    closeModal.addEventListener("click", Dashboard.closeImageBrowser);

  const imageBrowserModal = document.getElementById("imageBrowserModal");
  if (imageBrowserModal) {
    imageBrowserModal.addEventListener("click", (e) => {
      if (e.target === imageBrowserModal) Dashboard.closeImageBrowser();
    });
  } else {
    console.warn("imageBrowserModal not found on DOM load");
  }

  document.addEventListener("keydown", (e) => {
    if (
      document
        .getElementById("imageBrowserModal")
        ?.classList.contains("active") &&
      e.key === "Escape"
    )
      Dashboard.closeImageBrowser();
  });
});
