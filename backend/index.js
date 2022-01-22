const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const axios = require("axios");

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

const app = express();
const port = process.env.PORT;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.post("/similarity", async (req, res) => {
  const body = req.body;
  console.log(body);

  const firstProteinSequence = body.firstProteinSequence;
  const secondProteinSequence = body.secondProteinSequence;

  const validationResult = validateBody(
    firstProteinSequence,
    secondProteinSequence
  );
  if (validationResult.success) {
    const proteinHashId = createMd5CspHash(
      firstProteinSequence,
      secondProteinSequence
    );

    const proteinRef = db.collection("train-pairs").doc(proteinHashId);
    const doc = await proteinRef.get();
    if (doc.exists) {
      const proteinData = doc.data();
      const scoreResult = {
        success: true,
        score: proteinData.score,
        is_sw: true,
      };
      res.status(200).json(scoreResult);
    } else {
      const result = await getModelScore(
        firstProteinSequence,
        secondProteinSequence,
        proteinHashId
      );
      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(200).json(result);
      }
    }
  } else {
    res.status(200).json(validationResult);
  }
});

const getModelScore = async function (
  firstProteinSequence,
  secondProteinSequence,
  proteinHashId
) {
  const res = await axios
    .post(process.env.PYTHON_URL + ":" + process.env.PYTHON_PORT + "/", {
      firstProteinSequence: firstProteinSequence,
      secondProteinSequence: secondProteinSequence,
      proteinHashId: proteinHashId,
    })
    .catch(function (error) {
      if (error.response) {
        console.log(error.response.data);
        console.log(error.response.status);
      } else if (error.request) {
        console.log(error.request);
      } else {
        console.log("Error", error.message);
      }
      return {
        success: false,
        message: "Error occured while getting model prediciton.",
      };
    });
  console.log(res.data);
  const score = res.data.score;

  return { success: true, score: score, is_sw: false };
};

const validateBody = function (firstProteinSequence, secondProteinSequence) {
  console.log("first protein sequence:", firstProteinSequence);
  console.log("second protein sequence:", secondProteinSequence);
  if (
    firstProteinSequence === undefined ||
    secondProteinSequence === undefined
  ) {
    return { success: false, message: "Sequences should be initialized." };
  }
  if (firstProteinSequence.length === 0 || secondProteinSequence.length === 0) {
    return { success: false, message: "Sequence cannot be empty" };
  }
  if (
    !(
      /^[a-zA-Z]+$/.test(firstProteinSequence) &&
      /^[a-zA-Z]+$/.test(secondProteinSequence)
    )
  ) {
    return { success: false, message: "Sequence can only contain letters." };
  }
  return { success: true, message: "Sequences are validated." };
};

function createMd5CspHash(firstProteinSequence, secondProteinSequence) {
  if (firstProteinSequence.localeCompare(secondProteinSequence)) {
    return crypto
      .createHash("md5")
      .update(firstProteinSequence + secondProteinSequence)
      .digest("base64");
  } else {
    return crypto
      .createHash("md5")
      .update(secondProteinSequence + firstProteinSequence)
      .digest("base64");
  }
}
app.listen(port, () => {
  console.log("Server started listening...");
});
