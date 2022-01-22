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

const PROTEIN_ALPHABET = new Set(['A', 'R', 'N', 'D', 'C','E','Q','G','H','I','L','K','M','F','P','S','T','W','Y','V'])

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.post("/similarity", async (req, res) => {
  const body = req.body;
  console.log(body);

  const rawFirstProteinSequence = body.firstProteinSequence;
  const rawSecondProteinSequence = body.secondProteinSequence;

  const validationResult = validateBody(
    rawFirstProteinSequence,
    rawSecondProteinSequence
  );
  if (validationResult.success) {
    const firstProteinSequence = rawFirstProteinSequence.toUpperCase()
    const secondProteinSequence = rawSecondProteinSequence.toUpperCase()

    if (firstProteinSequence === secondProteinSequence) {
      res.status(200).json({
        success: true,
        score: 1.0,
        is_sw: true
      })
      return
    }

    const proteinHashId = createMd5CspHash(
      firstProteinSequence,
      secondProteinSequence
    );
    console.log("protein hash id", proteinHashId)
    
    const trainProteinRef = db.collection("train-pairs").doc(proteinHashId);
    const docInTrainPairs = await trainProteinRef.get();
    if (docInTrainPairs.exists) {
      const proteinData = docInTrainPairs.data();
      const scoreResult = {
        success: true,
        score: proteinData.score,
        is_sw: true,
      };
      res.status(200).json(scoreResult);
    } else {
      const newProteinRef = db.collection("new-pairs").doc(proteinHashId)
      const docInNewPairs = await newProteinRef.get()
      if (docInNewPairs.exists) {
        const proteinData = docInNewPairs.data();
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
  if (res.data.score === -1) {
    return {
      success: false,
      message: "Error occured while getting model prediciton.",
    };
  }
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
  
  const uppercaseFirstProteinSequence = firstProteinSequence.toUpperCase()
  const uppercaseSecondProteinSequence = secondProteinSequence.toUpperCase()
  for (let i = 0; i < uppercaseFirstProteinSequence.length; i++) {
    if (!PROTEIN_ALPHABET.has(uppercaseFirstProteinSequence[i])) {
      return { success: false, message: "Sequence contains invalid aminoacid code." };
    }
  }
  for (let i = 0; i < uppercaseSecondProteinSequence.length; i++) {
    if (!PROTEIN_ALPHABET.has(uppercaseSecondProteinSequence[i])) {
      return { success: false, message: "Sequence contains invalid aminoacid code." };
    }
  }
  return { success: true, message: "Sequences are validated." };
};

function createMd5CspHash(firstProteinSequence, secondProteinSequence) {
  if (firstProteinSequence.localeCompare(secondProteinSequence)) {
    return crypto
      .createHash("md5")
      .update(firstProteinSequence + "_" + secondProteinSequence)
      .digest("base16");
  } else {
    return crypto
      .createHash("md5")
      .update(secondProteinSequence + "_" + firstProteinSequence)
      .digest("base16");
  }
}
app.listen(port, () => {
  console.log("Server started listening...");
});
