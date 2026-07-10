#!/bin/bash
echo "Building OsirisServerPlugin..."
echo ""
echo "Make sure you have Java 17+ and Maven installed!"
echo ""
mvn clean package
echo ""
echo "If successful, the plugin JAR will be in: target/osiris-server-plugin-1.0.0.jar"
