Dashboard.openImageModal = function (imageUrl) {
  const modal = document.getElementById("imageModal");
  const modalImg = document.getElementById("modalImage");
  modalImg.src = imageUrl;
  modal.classList.add("active");
  document.body.style.overflow = "hidden";

  modal.addEventListener("click", function handler(e) {
    if (e.target === modal) {
      modal.classList.remove("active");
      document.body.style.overflow = "";
      modal.removeEventListener("click", handler);
    }
  });

  document.addEventListener("keydown", function handler(e) {
    if (e.key === "Escape") {
      modal.classList.remove("active");
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handler);
    }
  });
};

Dashboard.uploadImage = async function (questionId, input) {
  if (!input.files || input.files.length === 0) return;

  const file = input.files[0];
  const formData = new FormData();
  formData.append("image", file);

  try {
    const response = await fetch(`/api/question/${questionId}/image`, {
      method: "POST",
      body: formData,
    });
    const result = await response.json();
    if (result.status === "success") {
      Dashboard.displayQuestionDetails(questionId);
    } else alert("Error uploading image: " + (result.error || "Unknown error"));
  } catch (err) {
    console.error("Error:", err);
    alert("Error uploading image");
  }
};

Dashboard.removeImage = async function (questionId) {
  if (!confirm("Are you sure you want to remove this image?")) return;

  try {
    const response = await fetch(`/api/question/${questionId}/image`, {
      method: "DELETE",
    });
    const result = await response.json();
    if (result.status === "success") {
      Dashboard.displayQuestionDetails(questionId);
    } else alert("Error removing image: " + (result.error || "Unknown error"));
  } catch (err) {
    console.error("Error:", err);
    alert("Error removing image");
  }
};
