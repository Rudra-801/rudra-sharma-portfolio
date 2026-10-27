/* NEXZO Planner Data v16 — immutable catalog separated from UI controller. */
(function(){'use strict';if(window.NEXZOPlannerData)return;
const SUBJECTS=['General','AI','Machine Learning','DSA','Python','Web Dev','DBMS','Operating System','Computer Networks','OOP','Cyber Security','Cloud Computing','Data Science','Java','C++','JavaScript','React','Node.js','SQL','Software Engineering','Computer Graphics','DAA','Digital Electronics','Discrete Maths','IoT','Aptitude','Maths'];
const TYPES=['Theory Study','MCQ Practice','Practice Questions','Short Questions','Long Questions','Coding Practice','Lab / Practical','Project Work','Case Study','Debugging','Quiz / Mock Test','Previous Year Questions','Revision','Notes Making','Research / Reading','Assignment','Presentation','Numerical Problems'];
const LEVELS=['Beginner','Intermediate','Advanced'];
const COUNTS=['3 Questions','5 Questions','10 Questions','15 Questions','20 Questions','5 MCQs','10 MCQs','20 MCQs','3 Coding Problems','5 Coding Problems','1 Mini Project'];
const DURATIONS=['1 Day','2 Days','3 Days','4 Days','5 Days','7 Days','10 Days'];
const PRIORITIES=['Low','Medium','High','Urgent'];
const PLACES=['Home','Library','College / Campus','Computer Lab','Online','Coaching / Class'];
const HOURS=['30 Min','1 Hour','2 Hours','3 Hours','4 Hours'];

const BANK={
    'General':['Explain the main concept in simple words.','List the most important points to remember.','Create one real-life example for this topic.','Compare the two most important ideas in this topic.','Write a short revision summary with key terms.'],
    'AI':['Explain Artificial Intelligence with two real-life examples.','Differentiate AI, ML and Deep Learning.','Explain informed vs uninformed search in AI.','Describe Bayes theorem use in AI decision-making.','List ethical issues in AI systems.'],
    'Machine Learning':['Explain supervised and unsupervised learning with examples.','What is train-test split and why is it used?','Differentiate classification and regression.','Explain overfitting and underfitting.','Define precision, recall and F1-score.'],
    'DSA':['Reverse an array without using extra space.','Find the missing number from 1 to n.','Remove duplicates from a sorted array.','Detect a loop in a linked list.','Explain stack vs queue with operations.'],
    'DBMS':['Explain normalization with 1NF, 2NF and 3NF.','Differentiate primary key and foreign key.','Write SQL query using INNER JOIN.','Explain ACID properties of transactions.','Create an ER diagram for student-course system.'],
    'Web Dev':['Create a responsive navbar using HTML/CSS.','Explain DOM manipulation with an example.','Build a login form with validation.','Explain frontend vs backend with examples.','Fetch data from an API and render cards.'],
    'Python':['Explain list, tuple, set and dictionary differences.','Write a Python program to count word frequency.','Explain exception handling with try/except.','Create a class with constructor and methods.','Read a file and print line count in Python.'],
    'Operating System':['Explain process vs thread.','Describe deadlock conditions and prevention.','Compare FCFS, SJF and Round Robin scheduling.','Explain paging and segmentation.','What is virtual memory?'],
    'Computer Networks':['Explain OSI model layers.','Differentiate TCP and UDP.','Explain DNS working.','What is IP addressing and subnetting?','Explain HTTP vs HTTPS.'],
    'Cyber Security':['Explain OWASP Top 10.','What is SQL injection and prevention?','Explain phishing with prevention methods.','Differentiate authentication and authorization.','Write steps for basic password security audit.'],
    'Cloud Computing':['Explain IaaS, PaaS and SaaS.','Differentiate AWS EC2 and S3.','Explain deployment pipeline basics.','What is Docker and containerization?','Explain scalability and load balancing.'],
    'IoT':['Explain IoT architecture layers.','Design an RFID attendance system.','Explain MQTT publish-subscribe model.','List sensors used in smart agriculture.','Explain ESP32 use in IoT projects.'],
    'Maths':['Solve a system of linear equations.','Explain matrix multiplication with example.','Define probability with sample space.','Solve a quadratic equation.','Explain derivatives with one application.'],
    'Aptitude':['Solve a percentage increase/decrease problem.','Solve ratio and proportion question.','Solve time and work problem.','Solve profit and loss question.','Solve average speed problem.']
  };

window.NEXZOPlannerData=Object.freeze({SUBJECTS,TYPES,LEVELS,COUNTS,DURATIONS,PRIORITIES,PLACES,HOURS,BANK});})();
