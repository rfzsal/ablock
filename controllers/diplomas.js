'use strict';
require('dotenv').config();
const fs = require('fs').promises;
const { Web3Storage, File } = require('web3.storage');
const { ethers } = require('ethers');
const formidable = require('formidable');

const DiplomasContract = require('../contracts/Diplomas.json').abi;

const LOCAL_DEVELOPMENT = process.env.LOCAL_DEVELOPMENT;
const LOCAL_WALLET_PRIVATE_KEY = process.env.LOCAL_WALLET_PRIVATE_KEY;
const LOCAL_CONTRACT_ADDRESS = process.env.LOCAL_CONTRACT_ADDRESS;
const ALCHEMY_NETWORK = process.env.ALCHEMY_NETWORK;
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const WEB3STORAGE_TOKEN = process.env.WEB3STORAGE_TOKEN;

const createContract = () => {
  const provider = LOCAL_DEVELOPMENT
    ? new ethers.getDefaultProvider('http://127.0.0.1:8545')
    : new ethers.providers.AlchemyProvider(ALCHEMY_NETWORK, ALCHEMY_API_KEY);

  const wallet = LOCAL_DEVELOPMENT
    ? new ethers.Wallet(LOCAL_WALLET_PRIVATE_KEY, provider)
    : new ethers.Wallet(WALLET_PRIVATE_KEY, provider);

  return LOCAL_DEVELOPMENT
    ? {
        r: new ethers.Contract(
          LOCAL_CONTRACT_ADDRESS,
          DiplomasContract,
          provider
        ),
        rw: new ethers.Contract(
          LOCAL_CONTRACT_ADDRESS,
          DiplomasContract,
          wallet
        )
      }
    : {
        r: new ethers.Contract(CONTRACT_ADDRESS, DiplomasContract, provider),
        rw: new ethers.Contract(CONTRACT_ADDRESS, DiplomasContract, wallet)
      };
};
const contracts = createContract();

const parseForm = (req, res, { checkName = false, checkNIM = false }) => {
  return new Promise((resolve) => {
    const form = formidable();
    form.parse(req, (error, fields, files) => {
      if (error)
        return res
          .status(400)
          .send({ status: 'Error', message: 'Error parsing uploaded file' });

      if (checkName && !fields.name)
        return res.status(400).send({
          status: 'Error',
          message: 'Name required'
        });

      if (checkNIM && !fields.NIM)
        return res.status(400).send({
          status: 'Error',
          message: 'NIM required'
        });

      if (!files.file)
        return res
          .status(400)
          .send({ status: 'Error', message: 'No file uploaded' });

      if (files.file.type !== 'image/png' && files.file.type !== 'image/jpeg')
        return res.status(400).send({
          status: 'Error',
          message: 'Uploaded file type is not png or jpg'
        });

      if (files.file.size > 1000000)
        return res.status(400).send({
          status: 'Error',
          message: 'Uploaded file size is too large (max 1MB)'
        });

      resolve({
        name: fields.name,
        NIM: fields.NIM,
        filePath: files.file.path
      });
    });
  });
};

const onRootCidReady = (hash) => {
  throw hash;
};
const web3storage = new Web3Storage({ token: WEB3STORAGE_TOKEN });

exports.validate = async (req, res) => {
  const { name, NIM, filePath } = await parseForm(req, res, {
    checkName: true,
    checkNIM: true
  });

  const file = await fs.readFile(filePath);
  const metadata = {
    name,
    NIM
  };
  const files = [
    new File([file], 'diploma'),
    new File([JSON.stringify(metadata)], 'metadata')
  ];

  web3storage.put(files, { name: NIM });
  web3storage
    .put([files[0]], { wrapWithDirectory: false, onRootCidReady })
    .catch(async (hash) => {
      const contractResult = await contracts.rw.add(hash);

      res.send({
        status: 'OK',
        message: 'Please wait a few minutes until the transaction is confirmed',
        data: contractResult
      });
    });
};

exports.verify = async (req, res) => {
  const { filePath } = await parseForm(req, res, {
    checkName: false,
    checkNIM: false
  });

  const file = await fs.readFile(filePath);
  const files = [new File([file], 'diploma')];

  web3storage
    .put(files, { wrapWithDirectory: false, onRootCidReady })
    .catch(async (hash) => {
      const contractResult = await contracts.r.get(hash);

      res.send({
        status: 'OK',
        message: contractResult ? 'File is authentic' : 'File is not authentic',
        data: contractResult
      });
    });
};

exports.get = async (req, res) => {
  const results = [];
  for await (const file of web3storage.list()) {
    results.push(file);
  }

  const NIM = req.params.NIM;
  const filteredResults = results.filter((file) => file.name === NIM);

  res.send({
    status: 'OK',
    message: `${filteredResults.length} data found`,
    data: filteredResults
  });
};
