/* eslint-disable max-len */
const fs = require("fs");
const _ = require("lodash");
const wiki = require("wikipedia");
const convert = require("convert-units");
const { lowerCase } = require("lower-case");
const { capitalCase } = require("change-case");
const extractValues = require("extract-values");
const stringSimilarity = require("string-similarity");
const { upperCaseFirst } = require("upper-case-first");

const cors = require("cors");
const path = require("path");
const axios = require("axios");
const morgan = require("morgan");
const dotenv = require("dotenv");
const express = require("express");
const compression = require("compression");
const serveStatic = require("serve-static");

const pkg = require("./package.json");
const mainChat = require("./intents/Main_Chat.json");
const supportChat = require("./intents/support.json");
const wikipediaChat = require("./intents/wikipedia.json");
const welcomeChat = require("./intents/Default_Welcome.json");
const fallbackChat = require("./intents/Default_Fallback.json");
const unitConverterChat = require("./intents/unit_converter.json");

dotenv.config();

const standardRating = 0.6;
const botName = process.env.BOT_NAME || pkg.name;
const developerName = process.env.DEVELOPER_NAME || pkg.author.name;
const developerEmail = process.env.DEVELOPER_EMAIL || pkg.author.email;
const bugReportUrl = process.env.DEVELOPER_NAME || pkg.bugs.url;

const app = express();
const port = process.env.PORT || 3000;
let session = "session started";

let allQustions = [];

allQustions = _.concat(allQustions, wikipediaChat);
allQustions = _.concat(allQustions, unitConverterChat);
allQustions = _.concat(
  allQustions,
  _.flattenDeep(_.map(supportChat, "questions")),
);
allQustions = _.concat(
  allQustions,
  _.flattenDeep(_.map(mainChat, "questions")),
);

allQustions = _.uniq(allQustions);
allQustions = _.compact(allQustions);

const changeUnit = (amount, unitFrom, unitTo) => {
  try {
    const convertValue = convert(amount).from(unitFrom).to(unitTo);
    const returnMsg = `${amount} ${convert().describe(unitFrom).plural}(${
      convert().describe(unitFrom).abbr
    }) is equle to ${convertValue} ${convert().describe(unitTo).plural}(${
      convert().describe(unitTo).abbr
    }).`;

    return returnMsg;
  } catch (error) {
    return error.message;
  }
};

const sendAllQuestions = (req, res) => {
  const humanQuestions = [];

  try {
    allQustions.forEach((qus) => {
      if (qus.length >= 15) {
        if (
          /^(can|are|may|how|what|when|who|do|where|your|from|is|will|why)/gi.test(
            qus,
          )
        ) {
          humanQuestions.push(`${upperCaseFirst(qus)}?`);
        } else {
          humanQuestions.push(`${upperCaseFirst(qus)}.`);
        }
      }
    });
    res.json(_.shuffle(humanQuestions));
  } catch (error) {
    res.status(500).send({ error: "Lameza is busy", code: 500 });
    console.log(error);
  }
};

const sendWelcomeMessage = (req, res) => {
  res.json({
    responseText: _.sample(welcomeChat),
  });
};

const sendAnswer = async (req, res) => {
  let isFallback = false;
  let responseText = null;
  let rating = 0;
  let action = null;

  try {
    const query = decodeURIComponent(req.query.q).replace(/\s+/g, " ").trim() || "Hello";
    const humanInput = lowerCase(query.replace(/(\?|\.|!)$/gim, ""));

    const regExforUnitConverter = /(convert|change|in).{1,2}(\d{1,8})/gim;
    const regExforWikipedia = /(search for|tell me about|what is|who is)(?!.you) (.{1,30})/gim;
    const regExforSupport = /(invented|programmer|teacher|create|maker|who made|creator|developer|bug|email|report|problems)/gim;

    let similarQuestionObj;

    if (regExforUnitConverter.test(humanInput)) {
      action = "unit_converter";
      similarQuestionObj = stringSimilarity.findBestMatch(
        humanInput,
        unitConverterChat,
      ).bestMatch;
    } else if (regExforWikipedia.test(humanInput)) {
      action = "wikipedia";
      similarQuestionObj = stringSimilarity.findBestMatch(
        humanInput,
        wikipediaChat,
      ).bestMatch;
    } else if (regExforSupport.test(humanInput)) {
      action = "support";
      similarQuestionObj = stringSimilarity.findBestMatch(
        humanInput,
        _.flattenDeep(_.map(supportChat, "questions")),
      ).bestMatch;
    } else {
      action = "main_chat";
      similarQuestionObj = stringSimilarity.findBestMatch(
        humanInput,
        _.flattenDeep(_.map(mainChat, "questions")),
      ).bestMatch;
    }

    const similarQuestionRating = similarQuestionObj.rating;
    const similarQuestion = similarQuestionObj.target;

    if (action == "unit_converter") {
      const valuesObj = extractValues(humanInput, similarQuestion, {
        delimiters: ["{", "}"],
      });

      rating = 1;
      try {
        const { amount, unitFrom, unitTo } = valuesObj;
      
          
      responseText = changeUnit(amount, unitFrom, unitTo);
      } catch (error) {
        responseText = "One or more units are missing.";
        console.log(error);
      }
    } else if (action == "wikipedia") {
      const valuesObj = extractValues(humanInput, similarQuestion, {
        delimiters: ["{", "}"],
      });
      let { topic } = valuesObj;
      topic = capitalCase(topic);

      try {
        const wikipediaResponse = await wiki.summary(topic);
        const wikipediaResponseText = wikipediaResponse.extract;

        if (wikipediaResponseText == undefined || wikipediaResponseText == "") {
          responseText = `Sorry, My Data is locked at 2022 i cannot give the information regarding to "${topic}".`;
          isFallback = true;
        } else {
          responseText = wikipediaResponseText;
        }
      } catch (error) {
        responseText = `Sorry, we can't find any article related to "${topic}".`;
        console.log(error);
      }
    } else if (action == "support") {
      rating = similarQuestionRating;

      if (similarQuestionRating > standardRating) {
        for (let i = 0; i < supportChat.length; i++) {
          for (let j = 0; j < supportChat[i].questions.length; j++) {
            if (similarQuestion == supportChat[i].questions[j]) {
              responseText = _.sample(supportChat[i].answers);
            }
          }
        }
      }
    } else if (
      /(?:my name is|I'm|I am) (?!fine|good)(.{1,30})/gim.test(humanInput)
    ) {
const humanName = /(?:my name is|I'm|I am) (.{1,30})/gim.exec(humanInput);
      responseText = `hmm nice to meet you ${humanName[1]}.`;
      rating = 1;
    };
      
      if (similarQuestionRating > standardRating) {
        for (let i = 0; i < mainChat.length; i++) {
          for (let j = 0; j < mainChat[i].questions.length; j++) {
            if (similarQuestion == mainChat[i].questions[j]) {
              responseText = _.sample(mainChat[i].answers);
              rating = similarQuestionRating;
            }
          }
        }
      } else {
        isFallback = true;
        action = "Default_Fallback";
        if (
          humanInput.length >= 5
          && humanInput.length <= 20
          && !/(\s{1,})/gim.test(humanInput)
        ) {
          responseText = "You are hitting random keys :D";
            responseText = _.sample(fallbackChat);
        }
      }
    

    if (responseText == null) {
      responseText = _.sample(fallbackChat);
      isFallback = true;
    } else if (action != "wikipedia") {
      responseText = responseText
        .replace(/(\[BOT_NAME\])/g, botName)
        .replace(/(\[DEVELOPER_NAME\])/g, developerName)
        .replace(/(\[DEVELOPER_EMAIL\])/g, developerEmail)
        .replace(/(\[BUG_URL\])/g, bugReportUrl);
    }

    res.json({
      responseText,
      query,
      rating,
      action,
      isFallback,
      similarQuestion,
    });
  } catch (error) {
    console.log(error);
    if (error.message.includes("URI")) {
      res.status(500).send({ error: error.message, code: 500 });
    } else {
      res.status(500).send({ error: "Internal Server Error!", code: 500 });
    }
  }
};

const notFound = async (req, res) => {
  try {
    const pageNotFoundHtml = await fs.readFileSync(
      path.join(__dirname, "public/banned.html"),
      "utf8",
    );
    res.status(404).send(pageNotFoundHtml);
  } catch (err) {
    res.status(404).send("Page Not Found!");
    console.log(err);
  }
};

app.use(cors());
app.use(compression());
app.set("json spaces", 4);
app.use("/api/", morgan("tiny"));
app.get("/api/question", sendAnswer);
app.get("/api/welcome", sendWelcomeMessage);
app.get("/api/allQuestions", sendAllQuestions);
app.use(serveStatic(path.join(__dirname, "public")));
app.get("*", notFound);

app.listen(port, () => console.log(`Lameza Service Started`));
const blockedIPs = new Set([
  '192.168.29.185',  // Here you set the IP you want to block.
]);

app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  if (blockedIPs.has(ip)) {
    // With this you block the ip, you can use "return res.status(403).send('Your message, like YOU ARE BLOCKED!');
    // Or you can redirect to another page with res.redirect
    return res.redirect('./public/banned.html');
  }
  next();
});

/* ------------------------------ */
/* FREE IP INFO API THIRD PARTIES */
/* ------------------------------ */
// -> https://ipapi.co/json
// -> https://ipinfo.io/json
// -> https://get.geojs.io/v1/ip/country.json

/* ------------------- */
/* ACCESS DENIED ERROR */
/* ------------------- */
function display_access_denied_error() {
    document.body.innerHTML
        = '<div id="access-denied-error">'
        + '<div class="middle-center">'
        + '<span class="pulsate-bck">'
        + '<i class="bi bi-exclamation-diamond-fill"></i>'
        + 'Access Denied'
        + '</span>'
        + '</div>'
        + '</div>'
}

/* ------------------------- */
/* BLOCK BLACKLIST COUNTRIES */
/* ------------------------- */
function block_blacklist_countries() {
    // Blacklist countries
    const blacklist_countries = [
        "DE", // Germany
          "US"  ,  // United States US
         // United Kingdom GB
         // Ukraine UA
        "AR", // Argentina
  
         // Canada CA
     // JAPAN JP
        "NO", // Norway
        "IN", //INDIA IN
    ]

    // Detecting the users country
    function get_country_code(api_url) {
        fetch(api_url, { method: 'GET' })
            .then(response => response.json()) // Getting ip info as json
            .then(result => {
                if (blacklist_countries.includes(result.country)) { // If my ip country code is in blacklist
                    display_access_denied_error() // Access denied error
                }
            })
            .catch(error => console.log('error', error))
    }

    // Getting country code from third party api
    get_country_code("https://get.geojs.io/v1/ip/country.json")
}

/* ------------------------- */
/* ALLOW WHITELIST COUNTRIES */
/* ------------------------- */
function allow_whitelist_countries() {
    // Whitelist countries
    const whitelist_countries = [
        "DE", // Germany
        "US", // United States
        "GB", // United Kingdom
        "UA", // Ukraine
        "AR", // Argentina
        "FI", // Finland
        "CA", // Canada
        "JP", // Japan
        "NO", // Norway
        "RU" // Russia
    ]

    // Detecting the users country
    function get_country_code(api_url) {
        fetch(api_url, { method: 'GET' })
            .then(response => response.json()) // Getting ip info as json
            .then(result => {
                if (!whitelist_countries.includes(result.country)) { // If my ip country code is not in whitelist
                    display_access_denied_error() // Access denied error
                }
            })
            .catch(error => console.log('error', error))
    }

    // Getting country code from third party api
    get_country_code("https://get.geojs.io/v1/ip/country.json")
}

/* -------------- */
/* CALL FUNCTIONS */
/* -------------- */
block_blacklist_countries() // Block blacklist countries

// allow_whitelist_countries() // Allow whitelist countries