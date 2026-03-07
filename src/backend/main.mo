import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Array "mo:core/Array";
import Time "mo:core/Time";

actor {
  type Member = {
    whatsappNo : Text;
    fullName : Text;
    age : Text;
    height : Text;
    weight : Text;
    city : Text;
    goal : Text;
    plan : Text;
    startDate : Int;
    endDate : Int;
    referredBy : Text;
    createdAt : Int;
  };

  let members = Map.empty<Text, Member>();

  public shared ({ caller }) func registerMember(
    whatsappNo : Text,
    fullName : Text,
    age : Text,
    height : Text,
    weight : Text,
    city : Text,
    goal : Text,
    plan : Text,
    startDate : Int,
    endDate : Int,
    referredBy : Text,
  ) : async Bool {
    switch (members.get(whatsappNo)) {
      case (null) {
        let member : Member = {
          whatsappNo;
          fullName;
          age;
          height;
          weight;
          city;
          goal;
          plan;
          startDate;
          endDate;
          referredBy;
          createdAt = Time.now();
        };
        members.add(whatsappNo, member);
        true;
      };
      case (_) { false };
    };
  };

  public query ({ caller }) func getMember(whatsappNo : Text) : async ?Member {
    members.get(whatsappNo);
  };

  public query ({ caller }) func getReferralCount(whatsappNo : Text) : async Nat {
    var count = 0;
    for (member in members.values()) {
      if (member.referredBy == whatsappNo) { count += 1 };
    };
    count;
  };

  public query ({ caller }) func getAllMembers() : async [Member] {
    members.values().toArray();
  };

  public shared ({ caller }) func updateMember(
    whatsappNo : Text,
    fullName : Text,
    age : Text,
    height : Text,
    weight : Text,
    city : Text,
    goal : Text,
    plan : Text,
    startDate : Int,
    endDate : Int,
  ) : async Bool {
    switch (members.get(whatsappNo)) {
      case (null) { false };
      case (?existingMember) {
        let updatedMember : Member = {
          whatsappNo;
          fullName;
          age;
          height;
          weight;
          city;
          goal;
          plan;
          startDate;
          endDate;
          referredBy = existingMember.referredBy;
          createdAt = existingMember.createdAt;
        };
        members.add(whatsappNo, updatedMember);
        true;
      };
    };
  };
};
